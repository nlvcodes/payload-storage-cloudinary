import { APIError, CollectionBeforeChangeHook } from 'payload'
import type { CloudinaryCollectionConfig, CloudinaryDeliveryType } from '../types.js'
import { getFolderConfig } from '../helpers/normalizeConfig.js'
import {
  assetFieldsOf,
  buildDeliveryURL,
  deliveryAssetOf,
  STORED_URL_FIELDS,
  THUMBNAIL_TRANSFORMATION,
} from '../helpers/deliveryURL.js'
import { renameAsset } from '../helpers/renameAsset.js'
import { planMove, recordMove } from './assetMoves.js'

export const PRIVACY_CHANGE_FAILED =
  'Cloudinary could not change the privacy of this file. The file is unchanged. Try again.'

/**
 * The delivery type an update asks for when it sets `isPrivate`, or undefined when the asset is
 * already where `isPrivate` says. Marking a file private moves it only when the checkbox changes:
 * a legacy private row stored as `upload` moves through migratePrivateAssets. A save that leaves
 * a file public moves an asset still at `authenticated`, as a draft or an interrupted save leaves
 * it, so the next published save finishes the move.
 */
function privacyChangeTarget(
  config: CloudinaryCollectionConfig,
  data: Record<string, any>,
  originalDoc: Record<string, any>,
  storedType: CloudinaryDeliveryType,
): CloudinaryDeliveryType | undefined {
  if (!config.privateFiles || typeof data.isPrivate !== 'boolean') return undefined
  if (data.isPrivate) {
    return originalDoc.isPrivate !== true && storedType !== 'authenticated'
      ? 'authenticated'
      : undefined
  }
  return storedType === 'authenticated' ? 'upload' : undefined
}

/** The name of the dynamic folder field, or undefined when the folder is fixed. */
function folderFieldOf(config: CloudinaryCollectionConfig): string | undefined {
  const folderConfig = getFolderConfig(config)
  return folderConfig.enableDynamic ? folderConfig.fieldName || 'cloudinaryFolder' : undefined
}

/**
 * The public ID an update moves the asset to when it changes the dynamic folder, or undefined
 * when the update leaves the folder as it is.
 */
function movedPublicId(
  folderField: string | undefined,
  data: Record<string, any>,
  originalDoc: Record<string, any>,
): string | undefined {
  if (!folderField) return undefined

  const oldFolder = originalDoc[folderField] || ''
  const newFolder = data[folderField] || ''
  if (oldFolder === newFolder) return undefined

  const filename = String(originalDoc.cloudinaryPublicId).split('/').pop()
  return newFolder ? `${newFolder}/${filename}` : filename
}

export const createBeforeChangeHook =
  (collectionSlug: string, config: CloudinaryCollectionConfig): CollectionBeforeChangeHook =>
  async ({ data, originalDoc, req, operation }) => {
    // Only process if we have an existing document with a Cloudinary public ID
    if (!originalDoc?.cloudinaryPublicId) {
      return data
    }

    // Log what's happening
    if (operation === 'update') {
      req.payload.logger.info({
        msg: 'BeforeChange hook - Cloudinary file preservation check',
        collection: collectionSlug,
        hasOriginalFile: !!originalDoc.cloudinaryPublicId,
        hasNewFile: !!(data._file || data.file),
        willPreserveFile: !data._file && !data.file,
      })
    }

    // IMPORTANT: Ensure we're not accidentally clearing the Cloudinary data
    // This could cause the file to appear "deleted" even though it's still in Cloudinary
    if (!data.cloudinaryPublicId && originalDoc.cloudinaryPublicId) {
      req.payload.logger.warn({
        msg: 'Preserving Cloudinary data - preventing accidental deletion',
        collection: collectionSlug,
        cloudinaryPublicId: originalDoc.cloudinaryPublicId,
      })

      // Preserve all Cloudinary-related fields
      data.cloudinaryPublicId = originalDoc.cloudinaryPublicId
      data.cloudinaryUrl = originalDoc.cloudinaryUrl
      data.cloudinaryResourceType = originalDoc.cloudinaryResourceType
      data.cloudinaryFormat = originalDoc.cloudinaryFormat
      data.cloudinaryVersion = originalDoc.cloudinaryVersion
      data.url = originalDoc.url
      data.originalUrl = originalDoc.originalUrl
      data.thumbnailURL = originalDoc.thumbnailURL
    }

    // Marking a file private or public moves the asset to the matching delivery type, and a
    // new dynamic folder moves it to a new public ID. One rename does both, from the stored type.
    const storedAsset = deliveryAssetOf(originalDoc)
    const toType = privacyChangeTarget(config, data, originalDoc, storedAsset.deliveryType)
    const folderField = folderFieldOf(config)
    const toPublicId = movedPublicId(folderField, data, originalDoc)

    // A replacement file uploads with the new type and folder, and the old asset is deleted,
    // so there is nothing to rename.
    if ((!toType && !toPublicId) || req.file) {
      return data
    }

    // A move to `upload` waits until the row says the file is public: the afterChange hook
    // renames the asset after the save. Until then the row keeps the stored asset, so it reads as
    // private by its `authenticated` type, and a failed save leaves the asset where it was.
    if (toType === 'upload') {
      Object.assign(data, assetFieldsOf(storedAsset))
      data.requiresSignedURL = false
      planMove(req, {
        collection: collectionSlug,
        id: originalDoc.id,
        from: storedAsset,
        target: { publicId: toPublicId, deliveryType: toType },
        restore: {
          isPrivate: originalDoc.isPrivate,
          requiresSignedURL: originalDoc.requiresSignedURL,
          ...(folderField ? { [folderField]: originalDoc[folderField] ?? null } : {}),
        },
      })
      return data
    }

    // A move to `authenticated`, or a folder move that keeps the type, exposes nothing before
    // the save. When the save fails, the afterError hook moves the asset back.
    let renamed
    try {
      renamed = await renameAsset(storedAsset, { publicId: toPublicId, deliveryType: toType })
    } catch (error) {
      req.payload.logger.error({
        msg: toType
          ? 'Failed to change the Cloudinary delivery type'
          : 'Failed to move Cloudinary asset',
        collection: collectionSlug,
        cloudinaryPublicId: storedAsset.publicId,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      // The privacy checkbox must match where the file lives, so a privacy change stops here.
      if (toType) {
        throw new APIError(PRIVACY_CHANGE_FAILED, 502, undefined, true)
      }
      // A failed folder move leaves the asset where it was, and the update continues.
      return data
    }
    recordMove(req, {
      collection: collectionSlug,
      id: originalDoc.id,
      from: storedAsset,
      to: renamed,
    })

    Object.assign(data, assetFieldsOf(renamed))
    if (toType) {
      data.requiresSignedURL = renamed.deliveryType === 'authenticated'
    }
    if (renamed.deliveryType === 'authenticated') {
      // A private file stores no delivery URL: URLs are built at read time from the stored type.
      // null clears the stored column, and the adapter drops it for a field the collection lacks.
      for (const field of STORED_URL_FIELDS) data[field] = null
    } else if (!toType) {
      // A public file moved to another folder keeps its stored URLs pointing at the moved asset.
      data.cloudinaryUrl = buildDeliveryURL(renamed)
      data.url = data.cloudinaryUrl
      data.thumbnailURL = buildDeliveryURL(renamed, { transformation: THUMBNAIL_TRANSFORMATION })
    }

    req.payload.logger.info({
      msg: `Renamed Cloudinary asset ${storedAsset.publicId} to ${renamed.publicId}`,
      collection: collectionSlug,
      deliveryType: renamed.deliveryType,
    })

    return data
  }

import { APIError, type CollectionAfterChangeHook, type PayloadRequest } from 'payload'
import type { CloudinaryCollectionConfig } from '../types.js'
import { assetFieldsOf, type DeliveryAsset } from '../helpers/deliveryURL.js'
import { messageOf } from '../helpers/errorMessage.js'
import { renameAsset } from '../helpers/renameAsset.js'
import { writeStoredRow, writeVersionRow, type VersionRow } from '../helpers/storedRows.js'
import { createAfterReadHook } from './afterRead.js'
import {
  forgetMove,
  recordMove,
  storedRow,
  takePlannedMove,
  type AssetMove,
  type PlannedMove,
} from './assetMoves.js'
import { PRIVACY_CHANGE_FAILED } from './beforeChange.js'

/**
 * Moves an asset from `authenticated` to `upload` once the save that marks the file public has
 * written its row. The beforeChange hook plans the move, and this hook carries it out on the
 * caller's `req`, so its writes join the save's transaction where the adapter has one.
 *
 * - When the rename fails, the hook writes the row's privacy and folder fields back and fails the
 *   save with a 502. A transaction rolls the whole save back as well.
 * - When recording the moved asset fails, the hook moves the asset back to `authenticated` and
 *   writes the row back before the save fails. When the asset can't move back, the row keeps
 *   saying public, as the asset is.
 * - When the save fails later, after this hook, a transaction rolls the row back to private while
 *   the asset is at `upload`. The afterError hook moves the asset back for a REST request.
 *   Payload runs no collection hook for a failed GraphQL or Local API call, so there the asset
 *   stays at `upload` until the file is saved again. The plugin registers this hook after the
 *   collection's own afterChange hooks to keep that window small.
 * - On an adapter without transactions the row keeps every write made before the failure. The
 *   row then says public, records the asset this hook moved, and so agrees with Cloudinary.
 */
export const createAfterChangeHook = (
  collectionSlug: string,
  config: CloudinaryCollectionConfig,
): CollectionAfterChangeHook => {
  const afterRead = createAfterReadHook(collectionSlug, config)

  return async ({ collection, context, doc, operation, previousDoc, req }) => {
    if (operation !== 'update') return doc
    const move = takePlannedMove(req, collectionSlug, previousDoc?.id ?? doc?.id)
    if (!move) return doc

    // A draft save writes a version and leaves the published row as it was. While that row says
    // private, the asset stays `authenticated`.
    const row = await storedRow(req, collectionSlug, move.id)
    if (
      !row ||
      row.isPrivate === true ||
      row.requiresSignedURL === true ||
      row.cloudinaryPublicId !== move.from.publicId
    ) {
      req.payload.logger.info({
        msg: 'Kept the Cloudinary asset authenticated: the stored document still says private',
        collection: collectionSlug,
        cloudinaryPublicId: move.from.publicId,
      })
      return doc
    }

    let renamed: DeliveryAsset
    try {
      renamed = await renameAsset(move.from, move.target)
    } catch (error) {
      req.payload.logger.error({
        msg: 'Failed to change the Cloudinary delivery type',
        collection: collectionSlug,
        cloudinaryPublicId: move.from.publicId,
        error: messageOf(error),
      })
      await restoreRow(req, move)
      throw new APIError(PRIVACY_CHANGE_FAILED, 502, undefined, true)
    }
    const done: AssetMove = {
      collection: collectionSlug,
      id: move.id,
      from: move.from,
      to: renamed,
    }
    recordMove(req, done)

    const assetFields = assetFieldsOf(renamed)
    try {
      await writeStoredRow(req.payload, req, collectionSlug, move.id, assetFields)
      await recordInLatestVersion(req, collectionSlug, move, assetFields)
    } catch (error) {
      // When the asset can't move back, the row keeps saying public, as the asset is.
      if (await moveBack(req, done)) await restoreRow(req, move, move.from)
      throw error
    }

    req.payload.logger.info({
      msg: `Renamed Cloudinary asset ${move.from.publicId} to ${renamed.publicId}`,
      collection: collectionSlug,
      deliveryType: renamed.deliveryType,
    })

    // The response was read before the move, so rebuild its URLs from the moved asset.
    if (!doc || !('cloudinaryPublicId' in doc)) return doc
    for (const [field, value] of Object.entries(assetFields)) {
      if (field in doc) doc[field] = value
    }
    return (await afterRead({ collection, context, doc, req })) ?? doc
  }
}

/**
 * Records the moved asset in the version row the save wrote, when the collection keeps
 * versions, so that row does not read as private while the asset is at `upload`.
 */
async function recordInLatestVersion(
  req: PayloadRequest,
  collection: string,
  move: PlannedMove,
  assetFields: Record<string, unknown>,
): Promise<void> {
  if (!req.payload.collections[collection]?.config.versions) return
  const { docs } = await req.payload.db.findVersions<Record<string, any>>({
    collection,
    where: { parent: { equals: move.id } },
    sort: '-updatedAt',
    limit: 1,
    req,
  })
  const latest = docs[0] as VersionRow | undefined
  if (!latest || latest.version?.cloudinaryPublicId !== move.from.publicId) return

  await writeVersionRow(req.payload, req, collection, latest, {
    ...latest.version,
    ...assetFields,
  })
}

/** Moves an asset back to where it was before this request moved it. */
export async function moveBack(req: PayloadRequest, move: AssetMove): Promise<boolean> {
  try {
    await renameAsset(move.to, {
      publicId: move.from.publicId,
      deliveryType: move.from.deliveryType,
    })
    forgetMove(req, move)
    return true
  } catch (error) {
    req.payload.logger.error({
      msg:
        `Failed to move Cloudinary asset ${move.to.publicId} back to ${move.from.deliveryType}. ` +
        `Move it in Cloudinary, or save the document again.`,
      collection: move.collection,
      id: move.id,
      error: messageOf(error),
    })
    return false
  }
}

/**
 * Writes the row's privacy and folder fields back to what they were before the save, and the
 * asset fields too when given, after the move to `upload` failed. In a transaction the rollback
 * does this too. Without one, and in a bulk update, which commits the documents that saved, this
 * write is what puts the row back.
 */
async function restoreRow(
  req: PayloadRequest,
  move: PlannedMove,
  asset?: DeliveryAsset,
): Promise<void> {
  try {
    await writeStoredRow(req.payload, req, move.collection, move.id, {
      ...move.restore,
      ...(asset ? assetFieldsOf(asset) : {}),
    })
  } catch (error) {
    // The row keeps the asset's `authenticated` type, so it still reads as private.
    req.payload.logger.error({
      msg: 'Failed to restore the privacy of a document after a failed Cloudinary move',
      collection: move.collection,
      id: move.id,
      error: messageOf(error),
    })
  }
}

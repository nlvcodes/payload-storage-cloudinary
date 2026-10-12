import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionBeforeOperationHook,
} from 'payload'
import {
  isPreV4Row,
  markDestroyed,
  recordDocumentAsset,
  recordUpdateTarget,
  wasDestroyed,
  wasUploadedInRequest,
} from '../helpers/requestUploads.js'
import { deliveryAssetOf } from '../helpers/deliveryURL.js'
import { destroyAsset } from '../handlers/handleDelete.js'
import type { CloudinaryStorageOptions } from '../types.js'
import { isDocumentID } from '../helpers/storedDocument.js'

/**
 * Payload v4 removes a deleted or replaced document's stored file after the operation commits,
 * by storage key alone. These hooks record that document's Cloudinary asset on the request so
 * `deleteFile` can find it (see requestUploads.ts).
 */
export const createRecordPreviousAssetHook =
  (options: CloudinaryStorageOptions): CollectionAfterChangeHook =>
  async ({ collection, doc, operation, previousDoc, req }) => {
    // The storage plugin's own metadata write-back (context.skipCloudStorage) has a previousDoc
    // that pairs the new file's key with the replaced asset, so it records nothing.
    if (operation === 'update' && !req.context?.skipCloudStorage) {
      recordDocumentAsset(req, previousDoc)
      await destroyReplacedPreV4Asset(options, collection, doc, previousDoc, req)
    }
    return doc
  }

/**
 * Destroys the asset of a row from before Payload v4 that this update replaced.
 *
 * Payload v4 deletes a replaced file after the commit only when it recognizes the row's stored
 * file, by its stored URL. A private row stores no URL, and a public row's URL may not match
 * the one this adapter builds now, so Payload can leave the old asset behind. The plugin
 * deletes it here, as 1.x did after a replacement, and records it so the key-based `deleteFile`
 * doesn't destroy it again. A versioned collection keeps it for its versions, as Payload does.
 */
async function destroyReplacedPreV4Asset(
  options: CloudinaryStorageOptions,
  collection: Parameters<CollectionAfterChangeHook>[0]['collection'],
  doc: Record<string, unknown>,
  previousDoc: Record<string, unknown> | undefined,
  req: Parameters<CollectionAfterChangeHook>[0]['req'],
): Promise<void> {
  const oldId = previousDoc?.cloudinaryPublicId
  const newId = doc.cloudinaryPublicId
  if (!previousDoc || typeof oldId !== 'string' || !oldId || !isPreV4Row(previousDoc)) return
  // A replacement: this request uploaded the document's new asset
  if (typeof newId !== 'string' || newId === oldId || !wasUploadedInRequest(req, newId)) return
  if (wasUploadedInRequest(req, oldId) || wasDestroyed(req, oldId)) return
  if (collection.versions) return
  const collectionConfig = options.collections[collection.slug]
  if (typeof collectionConfig === 'object' && collectionConfig.deleteFromCloudinary === false) {
    return
  }

  const stored = deliveryAssetOf(previousDoc)
  try {
    await destroyAsset({
      publicId: oldId,
      resourceType: stored.resourceType || 'image',
      deliveryType: stored.deliveryType,
    })
    markDestroyed(req, oldId)
  } catch (error) {
    req.payload.logger.error({
      msg: `[Cloudinary] Failed to delete the replaced asset "${oldId}". Remove it in Cloudinary.`,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

export const createRecordDeletedAssetHook =
  (): CollectionAfterDeleteHook =>
  ({ doc, req }) => {
    recordDocumentAsset(req, doc)
    return doc
  }

/**
 * Records which document an update targets before Payload v4 stages its file, so a replacement
 * uploads with the document's stored privacy and folder (see requestUploads.ts).
 */
export const createRecordUpdateTargetHook =
  (): CollectionBeforeOperationHook =>
  ({ args, collection, operation, req }) => {
    if (operation === 'create' || operation === 'update') {
      const id = operation === 'update' && 'id' in args ? args.id : undefined
      recordUpdateTarget(req, collection.slug, isDocumentID(id) ? id : undefined)
    }
    return args
  }

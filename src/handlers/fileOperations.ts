import type { CopyFile, DeleteFile } from '@payloadcms/plugin-cloud-storage/types'
import { destroyAsset } from './handleDelete.js'
import {
  markDestroyed,
  recordedAssetFor,
  wasDestroyed,
  wasUploadedInRequest,
} from '../helpers/requestUploads.js'
import type { CloudinaryStorageOptions } from '../types.js'

/**
 * Payload v4's file operations address stored files by storage key (prefix + filename). This
 * adapter stores files by Cloudinary public ID, and a key can't be turned back into one in
 * general (dynamic folders, `uniqueFilename` suffixes), so the plugin records, on the request,
 * which asset each key is (see requestUploads.ts):
 *
 * - `deleteFile` destroys a recorded asset. A file this request uploaded is Payload rolling back
 *   a failed upload; it was never attached to a saved document, so it is deleted even when the
 *   collection sets `deleteFromCloudinary: false`. A deleted or replaced document's file follows
 *   `deleteFromCloudinary`, and is kept when this request just uploaded the same public ID. An
 *   unrecorded key (e.g. version pruning on a versioned collection) is left alone with a warning
 *   rather than risk deleting the wrong asset.
 * - `copyFile` backs Payload's file versioning (restoring a version's file) and file rename. It
 *   is not supported yet and rejects; Payload keeps the original file when a rename fails.
 *   `moveFile` is optional and deliberately not provided: Payload uses it, when present, in
 *   place of copy-then-delete, including to undo a staged move.
 */
export const createDeleteFile =
  (options: CloudinaryStorageOptions): DeleteFile =>
  async ({ collection, req, storageFilePath }) => {
    const asset = recordedAssetFor(req, storageFilePath)

    if (!asset) {
      req.payload.logger.warn({
        msg: `[Cloudinary] Not deleting "${storageFilePath}": this adapter can only map storage keys to Cloudinary public IDs for files uploaded, deleted or replaced in the same request. Remove the asset in Cloudinary if it is unused.`,
      })
      return
    }

    // The plugin already destroyed it in this request (a replaced row from before Payload v4)
    if (wasDestroyed(req, asset.publicId)) {
      return
    }

    if (asset.source === 'document') {
      const collectionConfig = options.collections[collection.slug]
      const keep =
        typeof collectionConfig === 'object' && collectionConfig.deleteFromCloudinary === false
      if (keep || wasUploadedInRequest(req, asset.publicId)) {
        return
      }
    }

    await destroyAsset(asset)
    markDestroyed(req, asset.publicId)
  }

const unsupported = (operation: string) =>
  new Error(
    `[Cloudinary] ${operation} is not supported yet: Payload's file versioning and file rename ` +
      'address files by storage key, which this adapter cannot map to Cloudinary public IDs.',
  )

export const createCopyFile = (): CopyFile => async () => {
  throw unsupported('Copying a stored file')
}

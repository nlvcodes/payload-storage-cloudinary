import type { HandleDelete } from '@payloadcms/plugin-cloud-storage/types'
import type {
  CloudinaryDeliveryType,
  CloudinaryStorageOptions,
  CloudinaryDocumentData,
} from '../types.js'
import { v2 as cloudinary } from 'cloudinary'
import { deliveryAssetOf } from '../helpers/deliveryURL.js'
import { markDestroyed, wasDestroyed, wasUploadedInRequest } from '../helpers/requestUploads.js'

export const createDeleteHandler =
  (options: CloudinaryStorageOptions): HandleDelete =>
  async ({ collection, doc, req }) => {
    const collectionConfig = options.collections[collection.slug]

    if (!collectionConfig || typeof collectionConfig === 'boolean') {
      return
    }

    // Check if deletion from Cloudinary is enabled (default: true)
    const deleteFromCloudinary = collectionConfig.deleteFromCloudinary !== false

    if (!deleteFromCloudinary) {
      // Skip Cloudinary deletion but still allow Payload to remove the document
      return
    }

    try {
      const docData = doc as unknown as CloudinaryDocumentData

      // Use stored public_id if available, otherwise try extracting from a Cloudinary URL
      const publicId =
        docData.cloudinaryPublicId ||
        (doc.url?.includes('cloudinary.com') ? extractPublicId(doc.url) : null)
      const resourceType = docData.cloudinaryResourceType || 'image'

      // A replacement can upload to the same public ID as the file it replaces (e.g. useFilename
      // with a new extension). Payload v4 deletes after uploading, so don't delete the new asset.
      if (publicId && (wasUploadedInRequest(req, publicId) || wasDestroyed(req, publicId))) {
        return
      }

      if (publicId) {
        const deliveryType = deliveryAssetOf(docData).deliveryType
        if (!(await destroyAsset({ publicId, resourceType, deliveryType }))) {
          req.payload.logger.warn({ msg: notDestroyedMessage(publicId, deliveryType) })
        }
        markDestroyed(req, publicId)
      }
    } catch (error) {
      console.error(
        `[Cloudinary Delete] Failed to delete: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }
  }

/**
 * Deletes an asset and its derived resources. Shared by the document-based `handleDelete` and
 * Payload v4's key-based `deleteFile`. Returns whether Cloudinary destroyed it: it answers
 * `not found` without throwing, e.g. for the wrong delivery type, which would leave the asset.
 */
export async function destroyAsset({
  publicId,
  resourceType,
  deliveryType,
}: {
  publicId: string
  resourceType: string
  deliveryType: CloudinaryDeliveryType
}): Promise<boolean> {
  // Delete the main asset. destroy defaults to `upload`, so pass the stored type.
  const { result } = (await cloudinary.uploader.destroy(publicId, {
    resource_type: resourceType,
    type: deliveryType,
    invalidate: true, // Invalidate CDN cache
  })) as { result?: string }

  // Also delete all derived resources (transformations)
  try {
    await cloudinary.api.delete_derived_resources([publicId], {
      resource_type: resourceType,
    })
  } catch {
    // It's okay if this fails - not all resources have derived versions
  }

  return result === 'ok'
}

/** The warning to log when Cloudinary did not destroy an asset. */
export const notDestroyedMessage = (publicId: string, deliveryType: CloudinaryDeliveryType) =>
  `[Cloudinary] Cloudinary did not delete "${publicId}" (type ${deliveryType}). Remove it in Cloudinary if it is unused.`

function extractPublicId(urlOrFilename: string): string | null {
  try {
    if (urlOrFilename.includes('cloudinary.com')) {
      const parts = urlOrFilename.split('/')
      const uploadIndex = parts.findIndex((part) => part === 'upload')

      if (uploadIndex !== -1 && uploadIndex < parts.length - 1) {
        const publicIdWithExtension = parts.slice(uploadIndex + 2).join('/')
        return publicIdWithExtension.substring(0, publicIdWithExtension.lastIndexOf('.'))
      }
    }

    return urlOrFilename.substring(0, urlOrFilename.lastIndexOf('.'))
  } catch {
    return null
  }
}

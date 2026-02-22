import type { CollectionBeforeValidateHook } from 'payload'
import type { CloudinaryCollectionConfig } from '../types.js'

export const createBeforeValidateHook =
  (collectionSlug: string, _config: CloudinaryCollectionConfig): CollectionBeforeValidateHook =>
  async ({ data, originalDoc, req, operation }) => {
    // Only run for updates
    if (operation !== 'update' || !originalDoc || !data) {
      return data
    }

    // Debug logging
    if (originalDoc.cloudinaryPublicId) {
      req.payload.logger.info({
        msg: 'BeforeValidate hook - checking Cloudinary data',
        collection: collectionSlug,
        operation,
        hasOriginalCloudinaryData: !!originalDoc.cloudinaryPublicId,
        hasIncomingCloudinaryData: !!data.cloudinaryPublicId,
        incomingFields: Object.keys(data),
      })
    }

    // If we have an original document with Cloudinary data but the incoming data is missing it,
    // this likely means only metadata is being updated (not the file itself)
    if (originalDoc.cloudinaryPublicId && !data.cloudinaryPublicId) {
      req.payload.logger.info({
        msg: 'Preserving Cloudinary data during metadata update',
        collection: collectionSlug,
        cloudinaryPublicId: originalDoc.cloudinaryPublicId,
      })

      // Preserve all Cloudinary-related fields
      data.cloudinaryPublicId = originalDoc.cloudinaryPublicId
      data.cloudinaryUrl = originalDoc.cloudinaryUrl
      data.cloudinaryResourceType = originalDoc.cloudinaryResourceType
      data.cloudinaryFormat = originalDoc.cloudinaryFormat
      data.cloudinaryVersion = originalDoc.cloudinaryVersion
      data.cloudinaryFolder = originalDoc.cloudinaryFolder

      // Preserve URLs
      data.url = originalDoc.url
      data.originalUrl = originalDoc.originalUrl
      data.thumbnailURL = originalDoc.thumbnailURL

      // Preserve file metadata
      data.filename = data.filename || originalDoc.filename
      data.filesize = data.filesize || originalDoc.filesize
      data.mimeType = data.mimeType || originalDoc.mimeType
      data.width = data.width || originalDoc.width
      data.height = data.height || originalDoc.height

      // Preserve eager transformations if they exist
      if (originalDoc.eagerTransformations) {
        data.eagerTransformations = originalDoc.eagerTransformations
      }
      if (originalDoc.secureTransformedUrl) {
        data.secureTransformedUrl = originalDoc.secureTransformedUrl
      }
    }

    return data
  }

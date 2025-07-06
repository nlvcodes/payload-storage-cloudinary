import { CollectionBeforeChangeHook } from 'payload'
import { v2 as cloudinary } from 'cloudinary'
import type { CloudinaryCollectionConfig } from '../types.js'
import { getFolderConfig } from '../helpers/normalizeConfig.js'

export const createBeforeChangeHook = (
  collectionSlug: string,
  config: CloudinaryCollectionConfig
): CollectionBeforeChangeHook => async ({ data, originalDoc, req }) => {
  // Only process if we have an existing document with a Cloudinary public ID
  if (!originalDoc?.cloudinaryPublicId) {
    return data
  }

  const folderConfig = getFolderConfig(config)
  
  // Check if dynamic folders are enabled
  if (!folderConfig.enableDynamic) {
    return data
  }

  const folderFieldName = folderConfig.fieldName || 'cloudinaryFolder'
  
  // Check if folder has changed
  const oldFolder = originalDoc[folderFieldName] || ''
  const newFolder = data[folderFieldName] || ''
  
  // If folder hasn't changed, nothing to do
  if (oldFolder === newFolder) {
    return data
  }

  // If we're changing folders and have a public ID, move the asset
  try {
    const oldPublicId = originalDoc.cloudinaryPublicId
    
    // Extract the filename from the old public ID
    const parts = oldPublicId.split('/')
    const filename = parts[parts.length - 1]
    
    // Construct new public ID with new folder
    const newPublicId = newFolder ? `${newFolder}/${filename}` : filename
    
    // Use Cloudinary's rename API to move the asset
    const result = await cloudinary.uploader.rename(
      oldPublicId,
      newPublicId,
      {
        resource_type: originalDoc.cloudinaryResourceType || 'auto',
        overwrite: false,
        invalidate: true,
      }
    )
    
    if (result.public_id) {
      // Update the data with new Cloudinary info
      data.cloudinaryPublicId = result.public_id
      data.cloudinaryUrl = result.secure_url
      data.cloudinaryVersion = result.version
      data.url = result.secure_url
      
      // Update thumbnail URL with new path
      const thumbnailUrl = cloudinary.url(result.public_id, {
        secure: true,
        version: result.version,
        transformation: {
          width: 150,
          height: 150,
          crop: 'fill',
          gravity: 'auto',
          quality: 'auto',
          fetch_format: 'auto'
        }
      })
      data.thumbnailURL = thumbnailUrl
      
      // Update the folder field to reflect the actual folder used
      if (result.folder) {
        data[folderFieldName] = result.folder
      }
      
      req.payload.logger.info({
        msg: `Moved Cloudinary asset from ${oldPublicId} to ${newPublicId}`,
        collection: collectionSlug,
      })
    }
  } catch (error) {
    req.payload.logger.error({
      msg: `Failed to move Cloudinary asset`,
      collection: collectionSlug,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    
    // Don't throw - let the update continue even if the move failed
    // The asset will remain in the old location
  }
  
  return data
}
import type { HandleDelete } from '@payloadcms/plugin-cloud-storage/types'
import type { CloudinaryStorageOptions } from '../types.js'
import { v2 as cloudinary } from 'cloudinary'

export const createDeleteHandler = (
  options: CloudinaryStorageOptions,
): HandleDelete => async ({ collection, doc, filename }) => {
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
    // Use stored public_id if available, otherwise extract from URL
    const publicId = (doc as any).cloudinaryPublicId || extractPublicId(doc.url || filename)
    
    if (publicId) {
      await cloudinary.uploader.destroy(publicId)
    }
  } catch (error) {
    console.error(`Failed to delete from Cloudinary: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

function extractPublicId(urlOrFilename: string): string | null {
  try {
    if (urlOrFilename.includes('cloudinary.com')) {
      const parts = urlOrFilename.split('/')
      const uploadIndex = parts.findIndex(part => part === 'upload')
      
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
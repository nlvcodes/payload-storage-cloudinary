import type { HandleDelete } from '@payloadcms/plugin-cloud-storage/types'
import type { CloudinaryStorageOptions } from '../types.js'
import { v2 as cloudinary } from 'cloudinary'

export const createDeleteHandler = (
  options: CloudinaryStorageOptions,
): HandleDelete => async ({ collection, doc, filename }) => {
  console.log('[Cloudinary Delete] Delete handler called for collection:', collection.slug)
  console.log('[Cloudinary Delete] Filename:', filename)
  console.log('[Cloudinary Delete] Has doc:', !!doc)
  console.log('[Cloudinary Delete] Doc data:', doc ? {
    id: doc.id,
    cloudinaryPublicId: (doc as any).cloudinaryPublicId,
    filename: doc.filename,
  } : 'No doc')
  console.log('[Cloudinary Delete] Stack trace:', new Error().stack)
  
  // SAFETY CHECK: If this is being called but the document still exists with Cloudinary data,
  // this might be an erroneous call during an update operation.
  if (doc && (doc as any).cloudinaryPublicId) {
    // Check if this is coming from a beforeChange hook (update operation) vs afterDelete (actual deletion)
    const stackTrace = new Error().stack || ''
    const isUpdateOperation = stackTrace.includes('beforeChange') || stackTrace.includes('updateDocument')
    const isDeleteOperation = stackTrace.includes('afterDelete') || stackTrace.includes('deleteByID')
    
    console.log('[Cloudinary Delete] Is update operation:', isUpdateOperation)
    console.log('[Cloudinary Delete] Is delete operation:', isDeleteOperation)
    console.log('[Cloudinary Delete] Has valid Cloudinary URL:', !!(doc as any).url)
    
    // Only prevent deletion if this is an update operation, not an actual delete
    if (isUpdateOperation && !isDeleteOperation) {
      console.warn('[Cloudinary Delete] WARNING: Delete called during update operation!')
      console.warn('[Cloudinary Delete] Document still has valid Cloudinary data. Preventing deletion.')
      console.warn('[Cloudinary Delete] This appears to be a bug in Payload cloud storage plugin.')
      return
    }
    
    // For actual deletions, log but allow to proceed
    if (isDeleteOperation) {
      console.log('[Cloudinary Delete] Legitimate delete operation detected. Proceeding with deletion.')
    }
  }
  
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
    const resourceType = (doc as any).cloudinaryResourceType || 'image'
    
    if (publicId) {
      // Delete the main asset
      await cloudinary.uploader.destroy(publicId, {
        resource_type: resourceType,
        invalidate: true, // Invalidate CDN cache
      })
      
      // Also delete all derived resources (transformations)
      // This ensures both original and transformed versions are removed
      try {
        await cloudinary.api.delete_derived_resources([publicId], {
          resource_type: resourceType,
        })
      } catch (derivedError) {
        // It's okay if this fails - not all resources have derived versions
        console.log(`No derived resources to delete for ${publicId}`)
      }
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
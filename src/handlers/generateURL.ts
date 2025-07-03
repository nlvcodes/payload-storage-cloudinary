import type { GenerateURL } from '@payloadcms/plugin-cloud-storage/types'
import type { CloudinaryStorageOptions } from '../types.js'
import { v2 as cloudinary } from 'cloudinary'
import { generateSignedURL } from '../helpers/signedURLs.js'
import { normalizeCollectionConfig, getTransformationConfig, getSignedURLConfig } from '../helpers/normalizeConfig.js'

export const createURLGenerator = (
  options: CloudinaryStorageOptions,
): GenerateURL => ({ collection, filename, prefix, data }) => {
  const collectionConfig = options.collections[collection.slug]
  
  if (!collectionConfig) {
    return filename
  }
  
  // If we already have a stored Cloudinary URL, return it directly
  if (data?.cloudinaryUrl) {
    return data.cloudinaryUrl
  }
  
  const rawConfig = typeof collectionConfig === 'boolean' ? {} : collectionConfig
  const config = normalizeCollectionConfig(rawConfig)
  const transformConfig = getTransformationConfig(config)
  
  // Check if this is a private file that requires signed URL
  const signedURLConfig = getSignedURLConfig(config)
  if (data?.requiresSignedURL && signedURLConfig) {
    return generateSignedURL({
      publicId: data.cloudinaryPublicId || filename,
      version: data.cloudinaryVersion,
      resourceType: data.cloudinaryResourceType,
      format: data.cloudinaryFormat,
      transformations: transformConfig.default,
    }, signedURLConfig)
  }
  
  const transformations: Record<string, any> = {
    ...(transformConfig.default || {}),
  }
  
  if (transformations.format === 'auto' || transformations.fetchFormat === 'auto') {
    transformations.fetch_format = 'auto'
    delete transformations.format
  }
  
  if (transformations.quality === 'auto') {
    transformations.quality = 'auto'
  }
  
  // Use the stored Cloudinary public_id if available
  const publicId = data?.cloudinaryPublicId || filename.substring(0, filename.lastIndexOf('.'))
  const fullPublicId = prefix && !data?.cloudinaryPublicId ? `${prefix}/${publicId}` : publicId
  
  const urlOptions: any = {
    secure: true,
    transformation: Object.keys(transformations).length > 0 ? transformations : undefined,
  }
  
  // Include version if available
  if (data?.cloudinaryVersion) {
    urlOptions.version = data.cloudinaryVersion
  }
  
  return cloudinary.url(fullPublicId, urlOptions)
}
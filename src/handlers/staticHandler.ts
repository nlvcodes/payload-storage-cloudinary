import type { StaticHandler } from '@payloadcms/plugin-cloud-storage/types'
import type { CloudinaryStorageOptions } from '../types.js'

export const createStaticHandler = (
  options: CloudinaryStorageOptions,
): StaticHandler => async (_req, { params, doc }) => {
  try {
    const { filename } = params
    const data = doc as any
    
    // If we have the stored Cloudinary URL, use it directly
    if (data?.cloudinaryUrl) {
      return new Response(null, {
        status: 302,
        headers: {
          Location: data.cloudinaryUrl,
        },
      })
    }
    
    // Fallback: construct URL using stored data or defaults
    const resourceType = data?.cloudinaryResourceType || 'image'
    const publicId = data?.cloudinaryPublicId || filename
    const version = data?.cloudinaryVersion
    
    // Handle folder paths in public_id
    // Include version in URL if available (e.g., v1234567890)
    const versionPath = version ? `v${version}/` : ''
    const cloudinaryUrl = `https://res.cloudinary.com/${options.cloudConfig.cloud_name}/${resourceType}/upload/${versionPath}${publicId}`
    
    return new Response(null, {
      status: 302,
      headers: {
        Location: cloudinaryUrl,
      },
    })
  } catch (error) {
    return new Response('Not found', { status: 404 })
  }
}
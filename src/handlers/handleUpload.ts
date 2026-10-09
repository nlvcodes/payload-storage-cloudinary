import type { HandleUpload } from '@payloadcms/plugin-cloud-storage/types'
import type {
  CloudinaryStorageOptions,
  CloudinaryCollectionConfig,
  CloudinaryUploadResult,
  CloudinaryDocumentData,
} from '../types.js'
import { v2 as cloudinary } from 'cloudinary'
import { queueManager } from '../queue/queueManager.js'
import { generatePrivateUploadOptions } from '../helpers/signedURLs.js'
import {
  buildDeliveryURL,
  deliveryTypeOf,
  STORED_URL_FIELDS,
  THUMBNAIL_TRANSFORMATION,
  type DeliveryAsset,
} from '../helpers/deliveryURL.js'
import {
  normalizeCollectionConfig,
  getFolderConfig,
  getTransformationConfig,
  getSignedURLConfig,
  fieldNamesOf,
} from '../helpers/normalizeConfig.js'

export const createUploadHandler =
  (options: CloudinaryStorageOptions): HandleUpload =>
  async (uploadArgs) => {
    const { collection, file, data } = uploadArgs
    // Support newer plugin-cloud-storage versions (3.70.0+) that pass req and clientUploadContext
    const clientUploadContext = (uploadArgs as any).clientUploadContext

    // If clientUploadContext is present, the client already uploaded — skip re-upload
    if (clientUploadContext) {
      return data
    }

    // Note: Payload's cloud storage plugin architecture calls this handler in two scenarios:
    // 1. When a new file is uploaded (file.buffer is present)
    // 2. Sometimes during updates even when no new file is selected (this seems to be a Payload behavior)
    // We handle both cases appropriately below

    const collectionConfig = options.collections[collection.slug]

    if (!collectionConfig) {
      throw new Error(`Collection ${collection.slug} is not configured for Cloudinary storage`)
    }

    const rawConfig = typeof collectionConfig === 'boolean' ? {} : collectionConfig
    const config = normalizeCollectionConfig(rawConfig)

    // Payload should only call this handler when there's a new file to upload
    if (!file.buffer) {
      // If we have an existing cloudinaryPublicId but no file buffer, this is likely an update without a new file
      // In this case, we should not re-upload to Cloudinary
      if (data?.cloudinaryPublicId) {
        // Ensure required fields are present to prevent fetch attempts
        if (!data.url && data.cloudinaryUrl && data.isPrivate !== true) {
          data.url = data.cloudinaryUrl
        }

        // Preserve existing metadata
        data.filename = data.filename || file.filename
        data.filesize = data.filesize || file.filesize
        data.mimeType = data.mimeType || file.mimeType

        return data // Return early without modifying the data
      }
      throw new Error('No file buffer provided for upload')
    }

    // A file buffer with an existing cloudinaryPublicId is a replacement. The storage plugin
    // names the incoming file after the document and deletes the old asset before this handler
    // runs, so the file always uploads, with the document's current privacy and folder.

    try {
      const uploadOptions = buildUploadOptions(config, file.filename, data, file.mimeType)
      // Check if upload queue is enabled
      if (config.uploadQueue?.enabled) {
        const queue = queueManager.getQueue(collection.slug, config.uploadQueue)

        // Add progress tracking field
        data.uploadStatus = 'queued'
        data.uploadProgress = 0

        // Create a promise that resolves when upload completes
        // For large files, enable chunked upload if configured
        if (
          config.uploadQueue.enableChunkedUploads &&
          file.filesize > (config.uploadQueue.largeFileThreshold || 100) * 1024 * 1024
        ) {
          uploadOptions.chunk_size = (config.uploadQueue.chunkSize || 20) * 1024 * 1024
        }

        const uploadPromise = new Promise<any>((resolve, reject) => {
          queue.addUpload({
            filename: file.filename,
            buffer: file.buffer,
            size: file.filesize,
            options: uploadOptions,
            onProgress: (progress) => {
              data.uploadProgress = progress
              data.uploadStatus = 'uploading'
            },
            onComplete: (result) => {
              data.uploadStatus = 'completed'
              data.uploadProgress = 100
              resolve(result)
            },
            onError: (error) => {
              data.uploadStatus = 'failed'
              reject(error)
            },
          })
        })

        const result = await uploadPromise

        // Clear upload status fields after successful upload
        delete data.uploadStatus
        delete data.uploadProgress

        return processUploadResult(result, data, file, config)
      }

      // Regular upload (non-queued)
      // For large files (especially videos), use upload_large method
      const isLargeFile = file.filesize > 100 * 1024 * 1024 // 100MB

      let result
      if (isLargeFile) {
        // Use upload_large for files over 100MB
        try {
          // Create a temporary readable stream from the buffer
          const { Readable } = await import('stream')
          const bufferStream = new Readable()
          bufferStream.push(file.buffer)
          bufferStream.push(null)

          result = await new Promise<any>((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_large_stream(
              {
                ...uploadOptions,
                chunk_size: 20 * 1024 * 1024, // 20MB chunks
              },
              (error, result) => {
                if (error) {
                  const errorMsg = error.message || 'Unknown error'
                  if (errorMsg.includes('413') || errorMsg.includes('File size too large')) {
                    reject(
                      new Error(
                        `File too large. Cloudinary has file size limits based on your plan. Consider upgrading your Cloudinary plan for larger files.`,
                      ),
                    )
                  } else {
                    reject(error)
                  }
                } else {
                  resolve(result)
                }
              },
            )

            bufferStream.pipe(uploadStream)
          })
        } catch (error) {
          // Provide more specific error message
          const errorMsg = error instanceof Error ? error.message : 'Unknown error'
          if (errorMsg.includes('File size too large') || errorMsg.includes('413')) {
            throw new Error(
              `File too large for your Cloudinary plan. Free plans typically support up to 100MB for images and 100MB for videos. Paid plans support larger files.`,
            )
          }
          throw error
        }
      } else {
        // Use stream upload for smaller files
        result = await new Promise<any>((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(uploadOptions, (error, result) => {
            if (error) {
              console.error('[Cloudinary Upload] Upload error:', error)
              // Provide more specific error messages
              const errorMsg = error.message || 'Unknown error'
              if (errorMsg.includes('File size too large')) {
                reject(
                  new Error(
                    `File too large for upload. Maximum file size depends on your Cloudinary plan. Error: ${errorMsg}`,
                  ),
                )
              } else if (errorMsg.includes('Invalid image file')) {
                reject(
                  new Error(
                    `Invalid file format. Please check that the file is a valid ${config.resourceType || 'media'} file.`,
                  ),
                )
              } else {
                reject(error)
              }
            } else {
              resolve(result)
            }
          })

          uploadStream.end(file.buffer)
        })
      }

      return processUploadResult(result, data, file, config)
    } catch (error) {
      throw new Error(
        `Failed to upload to Cloudinary: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }
  }

function processUploadResult(
  result: CloudinaryUploadResult,
  data: CloudinaryDocumentData,
  file: { filename: string; mimeType: string; filesize: number },
  config: CloudinaryCollectionConfig,
): CloudinaryDocumentData {
  if (result) {
    data.cloudinaryPublicId = result.public_id
    data.cloudinaryResourceType = result.resource_type
    data.cloudinaryFormat = result.format
    data.cloudinaryVersion = result.version
    data.cloudinaryType = deliveryTypeOf(result.type)

    // Store additional metadata that Payload expects
    data.filename = file.filename
    data.filesize = result.bytes || file.filesize // Use Cloudinary's byte count if available
    data.mimeType = file.mimeType

    // Take the dimensions from the Cloudinary response. A file without them (a raw file) stores
    // null, so a replacement does not keep the dimensions of the image it replaces.
    data.width = result.width || null
    data.height = result.height || null

    // Store the actual folder used
    if (result.folder) {
      data.cloudinaryFolder = result.folder
    }

    // Handle private file settings based on user's checkbox value
    if (config.privateFiles) {
      // If isPrivate is explicitly false, respect that
      if (data.isPrivate === false) {
        data.requiresSignedURL = false
      } else {
        // Otherwise, mark as private (default behavior)
        data.isPrivate = true
        data.requiresSignedURL = true
      }
    }

    // A private file stores no delivery URL. A stored URL is a permanent link, so the afterRead
    // hook builds every URL at read time, after the access check. Every private upload nulls
    // each stored URL field, so an update also clears any URL the row still holds, such as one
    // of the asset a replacement replaces or one a version before 1.3.0 stored.
    if (data.isPrivate === true) {
      // null clears the stored column. A missing key keeps the stored value on an update. The
      // database adapter drops a null for a field the collection doesn't have.
      const stored = data as Record<string, unknown>
      for (const field of STORED_URL_FIELDS) stored[field] = null
      return data
    }

    data.cloudinaryUrl = result.secure_url

    const asset: DeliveryAsset = {
      publicId: result.public_id,
      version: result.version,
      resourceType: result.resource_type,
      format: result.format,
      deliveryType: data.cloudinaryType,
    }

    // Generate thumbnail URL for admin display - note the uppercase URL
    data.thumbnailURL = buildDeliveryURL(asset, { transformation: THUMBNAIL_TRANSFORMATION })

    // Store the original URL (without transformations)
    const originalUrl = buildDeliveryURL(asset)
    data.originalUrl = originalUrl

    // Store the main URL - this will be the same as originalUrl if preserveOriginal is true
    // Transformations will be applied dynamically via afterRead hook
    data.url = originalUrl
  }
  return data
}

function sanitizeFolderPath(folder: string): string {
  return folder
    .trim()
    .replace(/\.\./g, '') // Remove path traversal segments
    .replace(/[^a-zA-Z0-9_\-/ ]/g, '') // Restrict to safe characters
    .replace(/\/+/g, '/') // Collapse consecutive slashes
    .replace(/^\/+|\/+$/g, '') // Remove leading/trailing slashes
}

function buildUploadOptions(
  config: CloudinaryCollectionConfig,
  filename: string,
  data?: any,
  mimeType?: string,
): Record<string, any> {
  // Determine resource type — SVG files need 'raw' to prevent Cloudinary misidentifying them
  let resourceType: string = config.resourceType || 'auto'
  if (!config.resourceType && mimeType === 'image/svg+xml') {
    resourceType = 'raw'
  }

  const options: Record<string, any> = {
    resource_type: resourceType,
  }

  // Handle private files
  const signedURLConfig = getSignedURLConfig(config)
  const transformConfig = getTransformationConfig(config)

  // Every private original uploads as authenticated, publicTransformation included,
  // so nothing reaches it without a signature
  if (signedURLConfig && data && data.isPrivate !== false) {
    const privateOptions = generatePrivateUploadOptions(signedURLConfig)
    Object.assign(options, privateOptions)
  }

  // Get folder configuration
  const folderConfig = getFolderConfig(config)
  let folder: string | undefined

  // Check for dynamic folder from data
  if (folderConfig.enableDynamic && data) {
    const folderField = folderConfig.fieldName || 'cloudinaryFolder'
    if (data[folderField]) {
      folder = data[folderField] as string
    }

    // Clean up and sanitize folder path
    if (folder) {
      folder = sanitizeFolderPath(folder)
    }
  }

  // Fall back to config folder
  if (!folder && folderConfig.path) {
    folder = folderConfig.path
  }

  if (folder) {
    options.folder = folder
    // Cloudinary automatically creates folders if they don't exist
  }

  if (config.useFilename && filename) {
    const nameWithoutExt =
      filename.lastIndexOf('.') > 0 ? filename.substring(0, filename.lastIndexOf('.')) : filename
    options.public_id = nameWithoutExt
  }

  if (config.uniqueFilename !== undefined) {
    options.unique_filename = config.uniqueFilename
  }

  // Handle transformations
  let transformations: Record<string, any> = {}

  // Start with default transformations
  if (transformConfig.default) {
    transformations = { ...transformConfig.default }
  }

  // When preserveOriginal is true, we should NEVER apply transformations during upload
  // All transformations should be applied via URL parameters only
  if (transformConfig.preserveOriginal) {
    // Clear any transformations - they'll be applied via URL only
    transformations = {}
  } else if (!transformConfig.publicTransformation?.enabled) {
    // Only apply transformations during upload if preserveOriginal is false
    // Apply preset if selected
    if (transformConfig.enablePresetSelection && data) {
      const presetField = fieldNamesOf(transformConfig).transformationPreset
      const selectedPreset = data[presetField]

      if (selectedPreset && transformConfig.presets) {
        const preset = transformConfig.presets.find((p) => p.name === selectedPreset)
        if (preset) {
          // Merge preset transformations with default transformations
          transformations = { ...transformations, ...preset.transformations }
        }
      }
    }

    // Apply transformations only if we have some
    if (Object.keys(transformations).length > 0) {
      options.transformation = transformations
    }
  }

  return options
}

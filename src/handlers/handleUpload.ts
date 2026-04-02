import type { HandleUpload } from '@payloadcms/plugin-cloud-storage/types'
import type {
  CloudinaryStorageOptions,
  CloudinaryCollectionConfig,
  CloudinaryUploadResult,
  CloudinaryDocumentData,
} from '../types.js'
import { v2 as cloudinary } from 'cloudinary'
import { queueManager } from '../queue/queueManager.js'
import { generatePrivateUploadOptions, generateSignedURL } from '../helpers/signedURLs.js'
import {
  normalizeCollectionConfig,
  getFolderConfig,
  getTransformationConfig,
  getSignedURLConfig,
} from '../helpers/normalizeConfig.js'
import {
  buildWatermarkTransformation,
  buildImageWatermarkTransformation,
  buildBlurTransformation,
} from '../helpers/watermark.js'

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
        if (!data.url && data.cloudinaryUrl) {
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

    // Additional check: if we have an existing cloudinaryPublicId,
    // this might be an update where Payload is re-sending the same file or a similar file
    if (data?.cloudinaryPublicId) {
      // Check if this is the same file or just an update
      const isSameFile =
        data.filename === file.filename ||
        (data.filename &&
          file.filename &&
          data.filename.replace(/[- ]\d+\./g, '.') === file.filename.replace(/[- ]\d+\./g, '.'))

      if (isSameFile) {
        // IMPORTANT: We need to ensure all required fields are present even when skipping upload
        // This prevents Payload from trying to fetch the file for processing
        if (!data.url && data.cloudinaryUrl) {
          data.url = data.cloudinaryUrl
        }

        // Ensure file metadata is present
        data.filename = file.filename || data.filename
        data.filesize = file.filesize || data.filesize
        data.mimeType = file.mimeType || data.mimeType

        // Skip the upload and return early - Payload is re-sending the same file
        return data
      } else {
        // Note: The old file will remain in Cloudinary unless manually deleted
        // This is by design to prevent accidental data loss
      }
    }

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
    data.cloudinaryUrl = result.secure_url
    data.cloudinaryResourceType = result.resource_type
    data.cloudinaryFormat = result.format
    data.cloudinaryVersion = result.version

    // Generate thumbnail URL for admin display - note the uppercase URL
    // For private files, we need to ensure the thumbnail is accessible
    const thumbnailUrl = cloudinary.url(result.public_id, {
      secure: true,
      version: result.version,
      resource_type: result.resource_type || 'image',
      type: result.type || 'upload', // Use 'upload' type for public access
      transformation: {
        width: 150,
        height: 150,
        crop: 'fill',
        gravity: 'auto',
        quality: 'auto',
        fetch_format: 'auto',
      },
    })
    data.thumbnailURL = thumbnailUrl // Changed to uppercase URL to match Payload's expectation

    // Store the original URL (without transformations)
    // This should be the raw URL without any transformations
    const originalUrl = cloudinary.url(result.public_id, {
      secure: true,
      version: result.version,
      resource_type: result.resource_type || 'image',
      type: result.type || 'upload',
      format: result.format,
      // No transformations here - this is the original
    })
    data.originalUrl = originalUrl

    // Get transformation config once for reuse
    const transformConfig = getTransformationConfig(config)

    // Store the main URL - this will be the same as originalUrl if preserveOriginal is true
    // Transformations will be applied dynamically via afterRead hook
    data.url = originalUrl

    // Store additional metadata that Payload expects
    data.filename = file.filename
    data.filesize = result.bytes || file.filesize // Use Cloudinary's byte count if available
    data.mimeType = file.mimeType

    // If it's an image, try to extract dimensions from Cloudinary response
    if (result.width) data.width = result.width
    if (result.height) data.height = result.height

    // Store the actual folder used
    if (result.folder) {
      data.cloudinaryFolder = result.folder
    }

    // Handle private file settings based on user's checkbox value
    if (config.privateFiles) {
      const signedURLConfig = getSignedURLConfig(config)

      // If isPrivate is explicitly false, respect that
      if (data.isPrivate === false) {
        data.requiresSignedURL = false
      } else {
        // Otherwise, mark as private (default behavior)
        data.isPrivate = true
        data.requiresSignedURL = true

        // If public transformations are enabled, we need to generate signed URLs
        // for the original and main URLs since the file was uploaded as public
        if (transformConfig.publicTransformation?.enabled && signedURLConfig) {
          // Replace URLs with signed versions
          data.url = generateSignedURL(
            {
              publicId: result.public_id,
              version: result.version,
              resourceType: result.resource_type,
              format: result.format,
              transformations: transformConfig.default,
            },
            signedURLConfig,
          )

          data.originalUrl = generateSignedURL(
            {
              publicId: result.public_id,
              version: result.version,
              resourceType: result.resource_type,
              format: result.format,
            },
            signedURLConfig,
          )
        }
      }
    }

    // Handle public transformation URL for private files
    if (transformConfig.publicTransformation?.enabled && data.isPrivate) {
      const fieldName = transformConfig.publicTransformation.fieldName || 'hasPublicTransformation'

      // Only generate public transformation URL if the checkbox is checked
      if (data[fieldName] === true) {
        let publicTransformation

        // Get the transformation type
        const typeFieldName =
          transformConfig.publicTransformation.typeFieldName || 'transformationType'
        const transformationType = data[typeFieldName] || 'watermark'

        if (transformationType === 'watermark' && transformConfig.publicTransformation.watermark) {
          const watermarkFieldName =
            transformConfig.publicTransformation.watermark.textFieldName || 'watermarkText'
          const watermarkText = data[watermarkFieldName] as string | undefined

          // Build watermark transformation
          if (transformConfig.publicTransformation.watermark.imageId) {
            publicTransformation = buildImageWatermarkTransformation(
              transformConfig.publicTransformation.watermark,
            )
          } else {
            publicTransformation = buildWatermarkTransformation(
              transformConfig.publicTransformation.watermark,
              watermarkText,
            )
          }
        } else if (transformationType === 'blur') {
          // Build blur transformation
          publicTransformation = buildBlurTransformation(transformConfig.publicTransformation.blur)
        }

        // For public transformation URLs, we need to use 'upload' type
        // even if the original was uploaded as 'authenticated'
        const publicTransformationUrl = cloudinary.url(result.public_id, {
          secure: true,
          version: result.version,
          resource_type: result.resource_type || 'image',
          type: 'upload', // Always use 'upload' for public URLs
          format: result.format,
          transformation: publicTransformation,
        })
        data.publicTransformationUrl = publicTransformationUrl
      }
    }
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

  // IMPORTANT: If public transformations are enabled, we should NOT upload as authenticated
  // because authenticated resources cannot have public transformation URLs
  if (
    signedURLConfig &&
    data &&
    data.isPrivate !== false &&
    !transformConfig.publicTransformation?.enabled
  ) {
    // Only apply private upload options if public transformations are NOT enabled
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
      const presetField = transformConfig.presetFieldName || 'transformationPreset'
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

import type { HandleUpload } from '@payloadcms/plugin-cloud-storage/types'
import type { FileData, PayloadRequest, TypeWithID } from 'payload'
import type {
  CloudinaryStorageOptions,
  CloudinaryCollectionConfig,
  CloudinaryUploadResult,
  CloudinaryDocumentData,
} from '../types.js'
import { v2 as cloudinary } from 'cloudinary'
import { queueManager } from '../queue/queueManager.js'
import { recordSkippedUpload, recordUpload, updateTargetOf } from '../helpers/requestUploads.js'
import { generatePrivateUploadOptions } from '../helpers/signedURLs.js'
import { storedLocale } from '../helpers/storedDocument.js'
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
    // Payload v4 calls this from the cloud storage plugin's afterChange hook, only for files
    // actually being uploaded in this request (files the client already uploaded are filtered
    // out upstream). `data` is a copy of the saved document: anything this handler wants
    // persisted must be returned, and Payload writes it back with a follow-up update.
    const { collection, file, data, req, storageFilePath } = uploadArgs

    const collectionConfig = options.collections[collection.slug]

    if (!collectionConfig) {
      throw new Error(`Collection ${collection.slug} is not configured for Cloudinary storage`)
    }

    const rawConfig = typeof collectionConfig === 'boolean' ? {} : collectionConfig
    const config = normalizeCollectionConfig(rawConfig)

    // With `upload.useTempFiles`, Payload hands over a temp file path instead of a buffer
    if (!file.buffer && file.tempFilePath) {
      const { readFile } = await import('fs/promises')
      file.buffer = await readFile(file.tempFilePath)
    }

    if (!file.buffer) {
      throw new Error('No file buffer provided for upload')
    }

    // Payload also passes each image variant, and the untransformed `-original` when a
    // transformer changed the file, as its own file. Their URLs are built from the main asset
    // (Cloudinary transforms on delivery), so uploading them would only leave assets that nothing
    // references or deletes. Only the main file is uploaded.
    const isMainFile = file.filename === data?.filename
    if (!isMainFile) {
      recordSkippedUpload(req, storageFilePath)
      return {}
    }

    // A replacement uploads with the document's current privacy and folder. Payload v4 deletes
    // the old asset after this upload; see the delete handler's same-public-ID guard.
    const settings = await withStoredSettings(req, collection.slug, config, data)

    try {
      const uploadOptions = buildUploadOptions(config, file.filename, settings, file.mimeType)
      // Check if upload queue is enabled
      if (config.uploadQueue?.enabled) {
        const queue = queueManager.getQueue(collection.slug, config.uploadQueue)

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
            onComplete: (result) => resolve(result),
            onError: (error) => reject(error),
          })
        })

        const result = await uploadPromise

        if (result?.public_id) {
          recordUpload(
            req,
            {
              publicId: result.public_id,
              resourceType: result.resource_type || 'image',
              deliveryType: deliveryTypeOf(result.type),
              overwritten: result.overwritten === true,
            },
            storageFilePath,
          )
        }

        return processUploadResult(result, settings, file, config)
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

      if (result?.public_id) {
        recordUpload(
          req,
          {
            publicId: result.public_id,
            resourceType: result.resource_type || 'image',
            deliveryType: deliveryTypeOf(result.type),
            overwritten: result.overwritten === true,
          },
          storageFilePath,
        )
      }

      return processUploadResult(result, settings, file, config)
    } catch (error) {
      throw new Error(
        `Failed to upload to Cloudinary: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }
  }

/**
 * The upload's data with the privacy and dynamic folder the request leaves out taken from the
 * stored document. Payload v4 stages an update's file before the document hooks run, with only
 * the request's data, so a replacement that sends just a file would otherwise upload with the
 * collection defaults. A create, or an update whose target is unknown, keeps `data` as it is.
 */
async function withStoredSettings(
  req: PayloadRequest,
  collection: string,
  config: CloudinaryCollectionConfig,
  data: CloudinaryDocumentData,
): Promise<CloudinaryDocumentData> {
  const folderConfig = getFolderConfig(config)
  const fields = [
    ...(config.privateFiles ? ['isPrivate'] : []),
    ...(folderConfig.enableDynamic ? [folderConfig.fieldName || 'cloudinaryFolder'] : []),
  ].filter((field) => data[field] === undefined)
  const id = updateTargetOf(req, collection)
  if (fields.length === 0 || id === undefined) return data

  const stored = await req.payload.db.findOne<TypeWithID & Record<string, unknown>>({
    collection,
    where: { id: { equals: id } },
    locale: storedLocale(req),
    joins: false,
    req,
  })
  if (!stored) return data
  const settings: CloudinaryDocumentData = { ...data }
  for (const field of fields) {
    if (stored[field] !== undefined && stored[field] !== null) settings[field] = stored[field]
  }
  return settings
}

// What Payload v4 persists from the handler. Its FileData types width and height as numbers,
// but the columns are nullable and this handler sets null on purpose (a raw file clears an
// image's dimensions), so the metadata is cast to this type where it is returned.
type UploadMetadata = Partial<FileData & TypeWithID>

function processUploadResult(
  result: CloudinaryUploadResult,
  data: CloudinaryDocumentData,
  file: { filename: string; mimeType: string; filesize: number },
  config: CloudinaryCollectionConfig,
): UploadMetadata {
  // Payload v4 persists only what the handler returns: `data` is a copy of the saved document,
  // read here for the user's choices (privacy) but never mutated.
  const metadata: CloudinaryDocumentData = {}

  if (result) {
    metadata.cloudinaryPublicId = result.public_id
    metadata.cloudinaryResourceType = result.resource_type
    metadata.cloudinaryFormat = result.format
    metadata.cloudinaryVersion = result.version
    metadata.cloudinaryType = deliveryTypeOf(result.type)

    // Store additional metadata that Payload expects
    metadata.filename = file.filename
    metadata.filesize = result.bytes || file.filesize // Use Cloudinary's byte count if available
    metadata.mimeType = file.mimeType

    // Take the dimensions from the Cloudinary response. A file without them (a raw file) stores
    // null, so a replacement does not keep the dimensions of the image it replaces.
    metadata.width = result.width || null
    metadata.height = result.height || null

    // Store the actual folder used
    if (result.folder) {
      metadata.cloudinaryFolder = result.folder
    }

    // Handle private file settings based on user's checkbox value
    if (config.privateFiles) {
      // If isPrivate is explicitly false, respect that
      if (data.isPrivate === false) {
        metadata.requiresSignedURL = false
      } else {
        // Otherwise, mark as private (default behavior)
        metadata.isPrivate = true
        metadata.requiresSignedURL = true
      }
    }

    // A private file stores no delivery URL. A stored URL is a permanent link, so the afterRead
    // hook builds every URL at read time, after the access check. Every private upload nulls
    // each stored URL field, so an update also clears any URL the row still holds, such as one
    // of the asset a replacement replaces or one a version before 1.3.0 stored.
    if ((metadata.isPrivate ?? data.isPrivate) === true) {
      // null clears the stored column. A missing key keeps the stored value on an update. The
      // database adapter drops a null for a field the collection doesn't have.
      const stored = metadata as Record<string, unknown>
      for (const field of STORED_URL_FIELDS) stored[field] = null
      return metadata as UploadMetadata
    }

    metadata.cloudinaryUrl = result.secure_url

    const asset: DeliveryAsset = {
      publicId: result.public_id,
      version: result.version,
      resourceType: result.resource_type,
      format: result.format,
      deliveryType: metadata.cloudinaryType,
    }

    // Generate thumbnail URL for admin display - note the uppercase URL
    metadata.thumbnailURL = buildDeliveryURL(asset, { transformation: THUMBNAIL_TRANSFORMATION })

    // Store the original URL (without transformations)
    // Store the main URL without transformations. The afterRead hook applies them, and builds
    // originalUrl, at read time.
    metadata.url = buildDeliveryURL(asset)
  }
  return metadata as UploadMetadata
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

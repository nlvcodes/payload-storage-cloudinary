import type { HandleUpload } from '@payloadcms/plugin-cloud-storage/types'
import type { CloudinaryStorageOptions, CloudinaryCollectionConfig } from '../types.js'
import { v2 as cloudinary } from 'cloudinary'
import { queueManager } from '../queue/queueManager.js'
import { generatePrivateUploadOptions } from '../helpers/signedURLs.js'
import { normalizeCollectionConfig, getFolderConfig, getTransformationConfig, getSignedURLConfig } from '../helpers/normalizeConfig.js'

export const createUploadHandler = (
  options: CloudinaryStorageOptions,
): HandleUpload => async ({ collection, file, data }) => {
  const collectionConfig = options.collections[collection.slug]
  
  if (!collectionConfig) {
    throw new Error(`Collection ${collection.slug} is not configured for Cloudinary storage`)
  }

  const rawConfig = typeof collectionConfig === 'boolean' ? {} : collectionConfig
  const config = normalizeCollectionConfig(rawConfig)
  
  try {
    const uploadOptions = buildUploadOptions(config, file.filename, data)
    
    // Check if upload queue is enabled
    if (config.uploadQueue?.enabled) {
      const queue = queueManager.getQueue(collection.slug, config.uploadQueue)
      
      // Add progress tracking field
      data.uploadStatus = 'queued'
      data.uploadProgress = 0
      
      // Create a promise that resolves when upload completes
      // For large files, enable chunked upload if configured
      if (config.uploadQueue.enableChunkedUploads && 
          file.filesize > (config.uploadQueue.largeFileThreshold || 100) * 1024 * 1024) {
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
                  reject(new Error(`File too large. Cloudinary has file size limits based on your plan. Consider upgrading your Cloudinary plan for larger files.`))
                } else {
                  reject(error)
                }
              } else {
                resolve(result)
              }
            }
          )
          
          bufferStream.pipe(uploadStream)
        })
      } catch (error) {
        // Provide more specific error message
        const errorMsg = error instanceof Error ? error.message : 'Unknown error'
        if (errorMsg.includes('File size too large') || errorMsg.includes('413')) {
          throw new Error(`File too large for your Cloudinary plan. Free plans typically support up to 100MB for images and 100MB for videos. Paid plans support larger files.`)
        }
        throw error
      }
    } else {
      // Use stream upload for smaller files
      result = await new Promise<any>((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          uploadOptions,
          (error, result) => {
            if (error) {
              // Provide more specific error messages
              const errorMsg = error.message || 'Unknown error'
              if (errorMsg.includes('File size too large')) {
                reject(new Error(`File too large for upload. Maximum file size depends on your Cloudinary plan. Error: ${errorMsg}`))
              } else if (errorMsg.includes('Invalid image file')) {
                reject(new Error(`Invalid file format. Please check that the file is a valid ${config.resourceType || 'media'} file.`))
              } else {
                reject(error)
              }
            } else {
              resolve(result)
            }
          }
        )
        
        uploadStream.end(file.buffer)
      })
    }
    
    return processUploadResult(result, data, file, config)
  } catch (error) {
    throw new Error(`Failed to upload to Cloudinary: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

function processUploadResult(result: any, data: any, file: any, config: CloudinaryCollectionConfig): void {
  if (result) {
    data.cloudinaryPublicId = result.public_id
    data.cloudinaryUrl = result.secure_url
    data.cloudinaryResourceType = result.resource_type
    data.cloudinaryFormat = result.format
    data.cloudinaryVersion = result.version
    
    // Generate thumbnail URL for admin display - note the uppercase URL
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
    data.thumbnailURL = thumbnailUrl  // Changed to uppercase URL to match Payload's expectation
    
    // Store the original URL for direct access
    data.url = result.secure_url
    
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
    
    // Mark as private if configured
    if (config.privateFiles) {
      data.isPrivate = true
      data.requiresSignedURL = true
    }
  }
}

function buildUploadOptions(
  config: CloudinaryCollectionConfig,
  _filename: string,
  data?: any
): Record<string, any> {
  const options: Record<string, any> = {
    resource_type: config.resourceType || 'auto',
  }
  
  // Handle private files
  const signedURLConfig = getSignedURLConfig(config)
  if (signedURLConfig) {
    const privateOptions = generatePrivateUploadOptions(signedURLConfig)
    Object.assign(options, privateOptions)
    
    // Mark file as private
    if (data) {
      data.isPrivate = true
      data.requiresSignedURL = true
    }
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
    
    // Clean up folder path if we have one
    if (folder) {
      folder = folder.trim().replace(/^\/+|\/+$/g, '') // Remove leading/trailing slashes
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
  
  if (config.useFilename !== undefined) {
    options.use_filename = config.useFilename
  }
  
  if (config.uniqueFilename !== undefined) {
    options.unique_filename = config.uniqueFilename
  }
  
  // Handle transformations
  const transformConfig = getTransformationConfig(config)
  let transformations: Record<string, any> = {}
  
  // Start with default transformations
  if (transformConfig.default) {
    transformations = { ...transformConfig.default }
  }
  
  // Apply preset if selected
  if (transformConfig.enablePresetSelection && data) {
    const presetField = transformConfig.presetFieldName || 'transformationPreset'
    const selectedPreset = data[presetField]
    
    if (selectedPreset && transformConfig.presets) {
      const preset = transformConfig.presets.find(p => p.name === selectedPreset)
      if (preset) {
        // Merge preset transformations with default transformations
        transformations = { ...transformations, ...preset.transformations }
      }
    }
  }
  
  // Apply transformations only if we have some
  if (Object.keys(transformations).length > 0) {
    // If preserveOriginal is true, use eager transformations instead
    if (transformConfig.preserveOriginal) {
      options.eager = [{ transformation: transformations }]
      options.eager_async = true // Process transformations asynchronously
    } else {
      options.transformation = transformations
    }
  }
  
  return options
}
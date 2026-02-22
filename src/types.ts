import type { Config } from 'payload'
import type { ConfigOptions } from 'cloudinary'

export interface TransformationPreset {
  name: string
  label: string
  transformations: Record<string, any>
  description?: string
  category?: 'size' | 'effect' | 'optimization' | 'social' | 'aspect-ratio'
}

export interface FolderConfig {
  path?: string // The default folder path
  enableDynamic?: boolean // Allow users to specify custom folders
  fieldName?: string // Custom field name for the folder input
  skipFieldCreation?: boolean // Skip automatic field creation, allowing users to provide their own implementation
}

export interface TransformationConfig {
  // Default transformations applied to all uploads
  default?: Record<string, any>
  // Preset configurations
  presets?: TransformationPreset[]
  enablePresetSelection?: boolean
  presetFieldName?: string
  // Ensure transformations don't override original
  preserveOriginal?: boolean
  // Public transformation for private files (e.g., watermarked preview)
  publicTransformation?: {
    enabled?: boolean
    fieldName?: string // Field name for checkbox, defaults to 'hasPublicTransformation'
    typeFieldName?: string // Field name for transformation type selector, defaults to 'transformationType'
    watermark?: {
      textFieldName?: string // Field name for watermark text, defaults to 'watermarkText'
      defaultText?: string // Default watermark text
      imageId?: string // Alternative: use an image as watermark
      style?: {
        fontFamily?: string
        fontSize?: number
        fontWeight?: string
        letterSpacing?: number
        color?: string
        opacity?: number
        angle?: number
        position?: string // gravity in Cloudinary terms
      }
    }
    blur?: {
      effect?: string // e.g., 'blur:2000'
      quality?: number
      width?: number
      height?: number
    }
  }
}

export interface UploadQueueConfig {
  enabled?: boolean
  maxConcurrentUploads?: number
  chunkSize?: number // in MB
  enableChunkedUploads?: boolean
  largeFileThreshold?: number // in MB, files larger than this use chunked upload
}

export interface SignedURLConfig {
  enabled: boolean // Must be explicitly enabled
  expiresIn?: number // seconds, default 3600 (1 hour)
  authTypes?: Array<'upload' | 'authenticated'>
  includeTransformations?: boolean
  /**
   * Custom authentication check for signed URLs.
   * This runs AFTER Payload's collection-level access control.
   * The document has already passed read access checks when this is called.
   * Use this for additional business logic beyond standard access control.
   * @param req - The request object with user information
   * @param doc - The document that passed Payload's access control
   * @returns Whether to allow generating a signed URL
   */
  customAuthCheck?: (req: any, doc: any) => boolean | Promise<boolean>
}

export interface CloudinaryCollectionConfig {
  // Cloudinary-specific options
  useFilename?: boolean
  uniqueFilename?: boolean
  resourceType?: 'image' | 'video' | 'raw' | 'auto'

  // Organized folder configuration
  folder?: FolderConfig | string // string for backward compatibility

  // Organized transformation configuration
  transformations?: TransformationConfig | Record<string, any> // Record for backward compatibility

  // Upload queue configuration
  uploadQueue?: UploadQueueConfig

  // Security configuration - privateFiles automatically enables signed URLs
  privateFiles?: boolean | SignedURLConfig

  // Deletion behavior
  deleteFromCloudinary?: boolean // Whether to delete files from Cloudinary when deleted in Payload (default: true)

  // Legacy fields for backward compatibility (will be mapped to new structure)
  enableDynamicFolders?: boolean
  folderField?: string
  signedURLs?: SignedURLConfig // Legacy - will be mapped to privateFiles
}

export interface CloudinaryStorageOptions {
  cloudConfig: ConfigOptions
  collections: {
    [collectionSlug: string]: boolean | CloudinaryCollectionConfig
  }
}

export type CloudinaryStoragePlugin = (
  options: CloudinaryStorageOptions,
) => (config: Config) => Config

// Shared Cloudinary interfaces to replace `any` types across handlers

export interface CloudinaryUploadResult {
  public_id: string
  version: number
  signature: string
  width?: number
  height?: number
  format: string
  resource_type: string
  created_at: string
  bytes: number
  type: string
  etag: string
  url: string
  secure_url: string
  folder?: string
  original_filename: string
}

export interface CloudinaryDocumentData {
  cloudinaryPublicId?: string
  cloudinaryUrl?: string
  cloudinaryResourceType?: string
  cloudinaryFormat?: string
  cloudinaryVersion?: number
  cloudinaryFolder?: string
  url?: string
  originalUrl?: string
  thumbnailURL?: string
  transformedUrl?: string
  filename?: string
  filesize?: number
  mimeType?: string
  width?: number
  height?: number
  isPrivate?: boolean
  requiresSignedURL?: boolean
  publicTransformationUrl?: string
  uploadStatus?: string
  uploadProgress?: number
  [key: string]: unknown
}

import type { Config } from 'payload'
import type { ConfigOptions } from 'cloudinary'

export interface TransformationPreset {
  name: string
  label: string
  transformations: Record<string, any>
  description?: string
}

export interface FolderConfig {
  path?: string // The default folder path
  enableDynamic?: boolean // Allow users to specify custom folders
  fieldName?: string // Custom field name for the folder input
  useFolderSelect?: boolean // Use dropdown folder selection instead of text input
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
  transformationPresets?: TransformationPreset[]
  enablePresetSelection?: boolean
  presetField?: string
  signedURLs?: SignedURLConfig // Legacy - will be mapped to privateFiles
}

export interface CloudinaryStorageOptions {
  cloudConfig: ConfigOptions
  collections: {
    [collectionSlug: string]: boolean | CloudinaryCollectionConfig
  }
}

export type CloudinaryStoragePlugin = (options: CloudinaryStorageOptions) => (config: Config) => Config
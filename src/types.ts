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
  /**
   * @deprecated Ignored, and warned about at startup. Cloudinary signed URLs don't expire.
   */
  expiresIn?: number
  /**
   * @deprecated Ignored, and warned about at startup. URLs are signed, never token-authenticated.
   */
  authToken?: unknown
  authTypes?: Array<'upload' | 'authenticated'>
  includeTransformations?: boolean
  /**
   * Decides who gets the original file.
   * This runs AFTER the collection's `read` access, so the reader has already passed it.
   * The signed URL endpoints, the server helpers and every read of a private file run it.
   * With `publicTransformation` enabled and no customAuthCheck, nobody gets the original.
   * @param req - The request object with user information
   * @param doc - The document that passed the collection's `read` access, as stored, whatever
   *   the lookup selected or field `read` access hid. It has the shape a read with every field
   *   visible returns at `depth: 0`: relationship fields hold IDs, and each localized field
   *   holds its value in one locale, with the site's fallback locale. On a localized site the
   *   check runs once per configured locale, whatever locale the reader asked for, and needs
   *   every run to pass. A version read by ID runs it on the version and on the current
   *   document, and needs both to pass.
   *
   *   To build this document the plugin reads the stored row (one more database read per
   *   document) and runs the collection's field `afterRead` hooks on it once per configured
   *   locale, with `overrideAccess: true`. Those hooks run again during the decision, so they
   *   must have no side effects.
   * @returns Whether the reader may get the original file
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

/** The Cloudinary types the plugin stores an asset as. */
export const CLOUDINARY_DELIVERY_TYPES = ['upload', 'authenticated'] as const

/** Where Cloudinary delivers an asset from. `authenticated` assets need a signed URL. */
export type CloudinaryDeliveryType = (typeof CLOUDINARY_DELIVERY_TYPES)[number]

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
  cloudinaryType?: CloudinaryDeliveryType
  cloudinaryFolder?: string
  url?: string
  originalUrl?: string
  thumbnailURL?: string
  transformedUrl?: string
  filename?: string
  filesize?: number
  mimeType?: string
  width?: number | null
  height?: number | null
  isPrivate?: boolean
  requiresSignedURL?: boolean
  /** @deprecated Set by versions before 1.3.0. Read `previewUrl` instead. */
  publicTransformationUrl?: string
  uploadStatus?: string
  uploadProgress?: number
  [key: string]: unknown
}

import type {
  CloudinaryCollectionConfig,
  CloudinaryStorageOptions,
  FolderConfig,
  TransformationConfig,
  SignedURLConfig,
} from '../types.js'

// Keys of TransformationConfig. Any one of them marks the new format.
const TRANSFORMATION_CONFIG_KEYS: (keyof TransformationConfig)[] = [
  'default',
  'presets',
  'enablePresetSelection',
  'presetFieldName',
  'preserveOriginal',
  'publicTransformation',
]

/**
 * True when `transformations` is a legacy object of direct Cloudinary transformations
 */
function isLegacyTransformations(transformations: unknown): boolean {
  return (
    typeof transformations === 'object' &&
    transformations !== null &&
    !TRANSFORMATION_CONFIG_KEYS.some((key) => key in transformations)
  )
}

/**
 * Normalizes the collection configuration to handle both legacy and new formats
 */
export function normalizeCollectionConfig(
  config: CloudinaryCollectionConfig,
): CloudinaryCollectionConfig {
  const normalized = { ...config }

  // Handle folder configuration
  if (typeof config.folder === 'string' || config.enableDynamicFolders || config.folderField) {
    const folderConfig: FolderConfig = {}

    if (typeof config.folder === 'string') {
      folderConfig.path = config.folder
    } else if (typeof config.folder === 'object') {
      Object.assign(folderConfig, config.folder)
    }

    // Map legacy fields
    if (config.enableDynamicFolders !== undefined) {
      folderConfig.enableDynamic = config.enableDynamicFolders
    }
    if (config.folderField !== undefined) {
      folderConfig.fieldName = config.folderField
    }

    normalized.folder = folderConfig
  }

  // Handle transformation configuration
  if (config.transformations) {
    const transformConfig: TransformationConfig = {}

    if (isLegacyTransformations(config.transformations)) {
      // Legacy format - direct transformations
      transformConfig.default = config.transformations as Record<string, any>
    } else if (config.transformations && typeof config.transformations === 'object') {
      // New format
      Object.assign(transformConfig, config.transformations)
    }

    normalized.transformations = transformConfig
  }

  // Handle private files and signed URLs configuration
  if (config.signedURLs) {
    // Legacy signedURLs field - map to privateFiles
    normalized.privateFiles = config.signedURLs
    delete normalized.signedURLs
  } else if (config.privateFiles === true) {
    // Convert boolean true to default signed URL config
    normalized.privateFiles = { enabled: true }
  }

  return normalized
}

/**
 * Helper to get folder configuration
 */
export function getFolderConfig(config: CloudinaryCollectionConfig): FolderConfig {
  if (typeof config.folder === 'string') {
    return { path: config.folder }
  }
  return config.folder || {}
}

/**
 * Helper to get transformation configuration
 */
export function getTransformationConfig(config: CloudinaryCollectionConfig): TransformationConfig {
  if (isLegacyTransformations(config.transformations)) {
    return { default: config.transformations as Record<string, any> }
  }
  return (config.transformations as TransformationConfig) || {}
}

/** The names of the fields a collection can rename, keyed by each one's default name. */
export type ConfiguredFieldNames = {
  transformationPreset: string
  hasPublicTransformation: string
  transformationType: string
  watermarkText: string
}

/**
 * The names the collection's transformation config gives the preset, preview, transformation
 * type and watermark text fields, each defaulting to its own name. The field definitions, the
 * read hooks, the access rule and the migration all read the names from here.
 */
export function fieldNamesOf(transformConfig: TransformationConfig): ConfiguredFieldNames {
  const publicTransformation = transformConfig.publicTransformation
  return {
    transformationPreset: transformConfig.presetFieldName || 'transformationPreset',
    hasPublicTransformation: publicTransformation?.fieldName || 'hasPublicTransformation',
    transformationType: publicTransformation?.typeFieldName || 'transformationType',
    watermarkText: publicTransformation?.watermark?.textFieldName || 'watermarkText',
  }
}

/**
 * Helper to get signed URL configuration
 */
export function getSignedURLConfig(
  config: CloudinaryCollectionConfig,
): SignedURLConfig | undefined {
  if (config.privateFiles && typeof config.privateFiles === 'object') {
    return config.privateFiles
  }
  return undefined
}

const DEPRECATED_SIGNED_URL_SETTINGS = ['authToken', 'expiresIn'] as const

/**
 * Logs one warning for every `authToken` and `expiresIn` setting in the plugin options.
 * Both are accepted and ignored: Cloudinary signed URLs don't expire. Call once, at startup.
 */
export function warnDeprecatedSettings(options: CloudinaryStorageOptions): void {
  const found: string[] = []

  for (const [slug, collectionConfig] of Object.entries(options.collections)) {
    if (typeof collectionConfig === 'boolean') continue
    const signedURLConfig = getSignedURLConfig(normalizeCollectionConfig(collectionConfig))
    for (const setting of DEPRECATED_SIGNED_URL_SETTINGS) {
      if (signedURLConfig?.[setting] !== undefined) found.push(`${slug}.${setting}`)
    }
  }

  if (found.length === 0) return

  console.warn(
    `[payload-storage-cloudinary] ${found.join(', ')}: authToken and expiresIn are deprecated ` +
      'and ignored. Cloudinary signed URLs do not expire, so treat every signed URL as a ' +
      'bearer link. Remove these settings to silence this warning.',
  )
}

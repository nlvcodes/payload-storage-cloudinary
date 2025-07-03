import type { CloudinaryCollectionConfig, FolderConfig, TransformationConfig, SignedURLConfig } from '../types.js'

/**
 * Normalizes the collection configuration to handle both legacy and new formats
 */
export function normalizeCollectionConfig(config: CloudinaryCollectionConfig): CloudinaryCollectionConfig {
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
  if (config.transformations || config.transformationPresets || config.enablePresetSelection) {
    const transformConfig: TransformationConfig = {}
    
    if (config.transformations && typeof config.transformations === 'object' && !('default' in config.transformations)) {
      // Legacy format - direct transformations
      transformConfig.default = config.transformations as Record<string, any>
    } else if (config.transformations && typeof config.transformations === 'object') {
      // New format
      Object.assign(transformConfig, config.transformations)
    }
    
    // Map legacy fields
    if (config.transformationPresets !== undefined) {
      transformConfig.presets = config.transformationPresets
    }
    if (config.enablePresetSelection !== undefined) {
      transformConfig.enablePresetSelection = config.enablePresetSelection
    }
    if (config.presetField !== undefined) {
      transformConfig.presetFieldName = config.presetField
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
    normalized.privateFiles = {
      enabled: true,
      expiresIn: 3600, // Default 1 hour
    }
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
  if (config.transformations && typeof config.transformations === 'object' && !('default' in config.transformations)) {
    return { default: config.transformations as Record<string, any> }
  }
  return (config.transformations as TransformationConfig) || {}
}

/**
 * Helper to get signed URL configuration
 */
export function getSignedURLConfig(config: CloudinaryCollectionConfig): SignedURLConfig | undefined {
  if (config.privateFiles && typeof config.privateFiles === 'object') {
    return config.privateFiles
  }
  return undefined
}
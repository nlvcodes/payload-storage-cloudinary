import { cloudStoragePlugin } from '@payloadcms/plugin-cloud-storage'
import type { CloudinaryStorageOptions } from './types.js'
import type { Config } from 'payload'
import { createUploadHandler } from './handlers/handleUpload.js'
import { createDeleteHandler } from './handlers/handleDelete.js'
import { createURLGenerator } from './handlers/generateURL.js'
import { createStaticHandler } from './handlers/staticHandler.js'
import { createSignedURLEndpoint, createBatchSignedURLEndpoint } from './endpoints/signedURL.js'
import { createUploadStatusEndpoint, createCancelUploadEndpoint } from './endpoints/uploadStatus.js'
import { cloudinaryFoldersHandler } from './endpoints/cloudinaryFolders.js'
import { normalizeCollectionConfig, getFolderConfig, getTransformationConfig } from './helpers/normalizeConfig.js'
import { v2 as cloudinary } from 'cloudinary'

export const cloudinaryStorage = (options: CloudinaryStorageOptions) => {
  if (!options.cloudConfig.cloud_name || !options.cloudConfig.api_key || !options.cloudConfig.api_secret) {
    throw new Error('Missing required Cloudinary configuration: cloud_name, api_key, and api_secret are required')
  }
  
  cloudinary.config(options.cloudConfig)
  
  const collections = Object.entries(options.collections).reduce(
    (acc, [slug, collectionConfig]) => {
      const rawConfig = typeof collectionConfig === 'boolean' ? {} : collectionConfig
      const config = normalizeCollectionConfig(rawConfig)
      const folderConfig = getFolderConfig(config)
      const transformConfig = getTransformationConfig(config)
      
      acc[slug] = {
        adapter: ({ prefix }: { prefix?: string }) => {
          return {
            handleUpload: createUploadHandler(options),
            handleDelete: createDeleteHandler(options),
            generateURL: createURLGenerator(options),
            staticHandler: createStaticHandler(options),
            prefix,
            name: 'cloudinary',
            fields: [
              {
                name: 'cloudinaryPublicId',
                type: 'text',
                admin: {
                  hidden: true,
                  readOnly: true,
                },
              },
              {
                name: 'cloudinaryUrl',
                type: 'text',
                admin: {
                  hidden: true,
                  readOnly: true,
                },
              },
              {
                name: 'cloudinaryResourceType',
                type: 'text',
                admin: {
                  hidden: true,
                  readOnly: true,
                },
              },
              {
                name: 'cloudinaryFormat',
                type: 'text',
                admin: {
                  hidden: true,
                  readOnly: true,
                },
              },
              {
                name: 'cloudinaryVersion',
                type: 'number',
                admin: {
                  hidden: true,
                  readOnly: true,
                },
              },
              // Add file size field (visible)
              {
                name: 'filesize',
                type: 'number',
                label: 'File Size',
                admin: {
                  readOnly: true,
                  description: 'File size in bytes',
                },
              },
              // Add folder field if dynamic folders are enabled and not skipped
              ...(folderConfig.enableDynamic && !folderConfig.skipFieldCreation ? [{
                name: folderConfig.fieldName || 'cloudinaryFolder',
                type: 'text' as const,
                label: 'Cloudinary Folder',
                defaultValue: folderConfig.path || '',
                admin: {
                  description: 'Folder path in Cloudinary (e.g., products/2024)',
                  placeholder: folderConfig.path || 'uploads',
                },
              }] : []),
              // Add preset field if preset selection is enabled
              ...(transformConfig.enablePresetSelection && transformConfig.presets?.length ? [{
                name: transformConfig.presetFieldName || 'transformationPreset',
                type: 'select' as const,
                label: 'Transformation Preset',
                options: transformConfig.presets.map(preset => ({
                  label: preset.label,
                  value: preset.name,
                })),
                admin: {
                  description: 'Apply predefined image transformations',
                },
              }] : []),
              // Add private file fields only if private files are enabled
              ...(config.privateFiles ? [
                {
                  name: 'isPrivate',
                  type: 'checkbox' as const,
                  label: 'Private File',
                  defaultValue: true,
                  admin: {
                    description: 'Private files require signed URLs to access',
                  },
                },
                {
                  name: 'requiresSignedURL',
                  type: 'checkbox' as const,
                  label: 'Requires Signed URL',
                  admin: {
                    hidden: true,
                    readOnly: true,
                  },
                },
              ] : []),
            ],
          }
        },
        disableLocalStorage: true,
        disablePayloadAccessControl: true,
      }
      return acc
    },
    {} as Record<string, any>,
  )
  
  // Return a wrapped plugin that adds endpoints
  return (config: Config): Config => {
    // First apply the cloud storage plugin
    const basePlugin = cloudStoragePlugin({ collections })
    const modifiedConfig = basePlugin(config)
    
    // Then add our custom endpoints
    if (modifiedConfig.collections) {
      modifiedConfig.collections = modifiedConfig.collections.map(collection => {
        const collectionConfig = options.collections[collection.slug]
        if (!collectionConfig) return collection
        
        const rawConfig = typeof collectionConfig === 'boolean' ? {} : collectionConfig
        const config = normalizeCollectionConfig(rawConfig)
        const endpoints = [...(collection.endpoints || [])]
        
        // Add signed URL endpoints if private files are enabled
        if (config.privateFiles) {
          endpoints.push(
            createSignedURLEndpoint(collection.slug, options),
            createBatchSignedURLEndpoint(collection.slug, options)
          )
        }
        
        // Add upload status endpoints if queue is enabled
        if (config.uploadQueue?.enabled) {
          endpoints.push(
            createUploadStatusEndpoint(collection.slug),
            createCancelUploadEndpoint(collection.slug)
          )
        }
        
        
        return {
          ...collection,
          endpoints,
        }
      })
    }
    
    // Add global endpoints
    modifiedConfig.endpoints = [
      ...(modifiedConfig.endpoints || []),
      {
        path: '/cloudinary/folders',
        method: 'post',
        handler: cloudinaryFoldersHandler,
      },
    ]
    
    
    return modifiedConfig
  }
}

export type { CloudinaryStorageOptions, CloudinaryCollectionConfig, TransformationPreset, SignedURLConfig, FolderConfig } from './types.js'
export { getTransformationUrl, commonPresets } from './helpers/transformations.js'
export { generateSignedURL, generateDownloadURL, isAccessAllowed } from './helpers/signedURLs.js'

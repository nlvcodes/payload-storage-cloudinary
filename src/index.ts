import { cloudStoragePlugin } from '@payloadcms/plugin-cloud-storage'
import type { CloudinaryStorageOptions } from './types.js'
import type { Config } from 'payload'
import { createUploadHandler } from './handlers/handleUpload.js'
import { createDeleteHandler } from './handlers/handleDelete.js'
import { createURLGenerator } from './handlers/generateURL.js'
import { createStaticHandler } from './handlers/staticHandler.js'
import { createSignedURLEndpoint, createBatchSignedURLEndpoint } from './endpoints/signedURL.js'
import { createUploadStatusEndpoint, createCancelUploadEndpoint } from './endpoints/uploadStatus.js'
import {
  normalizeCollectionConfig,
  getFolderConfig,
  getTransformationConfig,
} from './helpers/normalizeConfig.js'
import { createBeforeChangeHook } from './hooks/beforeChange.js'
import { createAfterChangeHook } from './hooks/afterChange.js'
import { createAfterReadHook } from './hooks/afterRead.js'
import { createBeforeValidateHook } from './hooks/beforeValidate.js'
import { v2 as cloudinary } from 'cloudinary'

export const cloudinaryStorage = (options: CloudinaryStorageOptions) => {
  // Validate cloud config exists
  if (!options?.cloudConfig) {
    throw new Error('Cloudinary cloud_name, api_key, and api_secret are required')
  }

  // Validate required fields
  if (
    !options.cloudConfig.cloud_name ||
    !options.cloudConfig.api_key ||
    !options.cloudConfig.api_secret
  ) {
    throw new Error('Cloudinary cloud_name, api_key, and api_secret are required')
  }

  // Validate collections exist
  if (!options.collections || Object.keys(options.collections).length === 0) {
    throw new Error('At least one collection must be configured for Cloudinary storage')
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
              // Add originalUrl field to store untransformed URL
              {
                name: 'originalUrl',
                type: 'text',
                label: 'Original URL',
                admin: {
                  readOnly: true,
                  description: 'Direct URL to the original file without transformations',
                },
              },
              // Add transformedUrl field to store URL with transformations
              {
                name: 'transformedUrl',
                type: 'text',
                label: 'Transformed URL',
                admin: {
                  readOnly: true,
                  description: 'URL with applied transformations',
                  condition: (data: any) => {
                    const presetField = transformConfig.presetFieldName || 'transformationPreset'
                    return !!data[presetField]
                  },
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
              ...(folderConfig.enableDynamic && !folderConfig.skipFieldCreation
                ? [
                    {
                      name: folderConfig.fieldName || 'cloudinaryFolder',
                      type: 'text' as const,
                      label: 'Cloudinary Folder',
                      defaultValue: folderConfig.path || '',
                      admin: {
                        description: 'Folder path in Cloudinary (e.g., products/2024)',
                        placeholder: folderConfig.path || 'uploads',
                      },
                    },
                  ]
                : []),
              // Add preset field if preset selection is enabled
              ...(transformConfig.enablePresetSelection && transformConfig.presets?.length
                ? [
                    {
                      name: transformConfig.presetFieldName || 'transformationPreset',
                      type: 'select' as const,
                      label: 'Transformation Presets',
                      hasMany: true,
                      options: (() => {
                        // Group presets by category
                        const grouped = transformConfig.presets.reduce(
                          (acc, preset) => {
                            const category = preset.category || 'other'
                            if (!acc[category]) acc[category] = []
                            acc[category].push(preset)
                            return acc
                          },
                          {} as Record<string, typeof transformConfig.presets>,
                        )

                        // Create options with category headers
                        const options: Array<{ label: string; value: string }> = []
                        const categoryOrder = [
                          'size',
                          'social',
                          'aspect-ratio',
                          'effect',
                          'optimization',
                          'other',
                        ]
                        const categoryLabels: Record<string, string> = {
                          size: 'SIZE',
                          social: 'SOCIAL MEDIA',
                          'aspect-ratio': 'ASPECT RATIO',
                          effect: 'EFFECTS',
                          optimization: 'OPTIMIZATION',
                          other: 'OTHER',
                        }

                        categoryOrder.forEach((category) => {
                          if (grouped[category]) {
                            grouped[category].forEach((preset) => {
                              options.push({
                                label: `${categoryLabels[category] || category} › ${preset.label}`,
                                value: preset.name,
                              })
                            })
                          }
                        })

                        return options
                      })(),
                      admin: {
                        description:
                          'Select transformations to apply. Note: Only one preset from each category (Size, Effect, etc.) will be applied.',
                      },
                    },
                  ]
                : []),
              // Add private file fields only if private files are enabled
              ...(config.privateFiles
                ? [
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
                  ]
                : []),
              // Add public transformation fields if enabled
              ...(transformConfig.publicTransformation?.enabled && config.privateFiles
                ? [
                    {
                      name:
                        transformConfig.publicTransformation.fieldName || 'hasPublicTransformation',
                      type: 'checkbox' as const,
                      label: 'Enable Public Preview',
                      defaultValue: false,
                      admin: {
                        description:
                          'Generate a public URL with transformations for this private file',
                        condition: (data: any) => data.isPrivate === true,
                      },
                    },
                    // Add transformation type selector
                    {
                      name:
                        transformConfig.publicTransformation.typeFieldName || 'transformationType',
                      type: 'select' as const,
                      label: 'Transformation Type',
                      defaultValue: 'watermark',
                      options: [
                        { label: 'Watermark', value: 'watermark' },
                        { label: 'Blur', value: 'blur' },
                      ],
                      admin: {
                        description: 'Choose the type of transformation for public preview',
                        condition: (data: any) =>
                          data.isPrivate === true &&
                          data[
                            transformConfig.publicTransformation?.fieldName ||
                              'hasPublicTransformation'
                          ] === true,
                      },
                    },
                    // Add watermark text field conditionally
                    {
                      name:
                        transformConfig.publicTransformation.watermark?.textFieldName ||
                        'watermarkText',
                      type: 'text' as const,
                      label: 'Watermark Text',
                      defaultValue:
                        transformConfig.publicTransformation.watermark?.defaultText || '',
                      admin: {
                        description: 'Text to display as watermark on public preview',
                        condition: (data: any) => {
                          const typeField =
                            transformConfig.publicTransformation?.typeFieldName ||
                            'transformationType'
                          return (
                            data.isPrivate === true &&
                            data[
                              transformConfig.publicTransformation?.fieldName ||
                                'hasPublicTransformation'
                            ] === true &&
                            data[typeField] === 'watermark'
                          )
                        },
                      },
                    },
                    {
                      name: 'publicTransformationUrl',
                      type: 'text' as const,
                      label: 'Public Preview URL',
                      admin: {
                        readOnly: true,
                        description: 'Public URL with applied transformations',
                        condition: (data: any) =>
                          data.isPrivate === true &&
                          data[
                            transformConfig.publicTransformation?.fieldName ||
                              'hasPublicTransformation'
                          ] === true,
                      },
                    },
                    {
                      name: 'publicTransformationPublicId',
                      type: 'text' as const,
                      label: 'Public Transformation ID',
                      admin: {
                        hidden: true,
                        readOnly: true,
                      },
                    },
                    // Add preview URL with transformation presets
                    {
                      name: 'previewUrl',
                      type: 'text' as const,
                      label: 'Preview URL with Transformations',
                      admin: {
                        readOnly: true,
                        description: 'Preview URL with selected transformation presets applied',
                        condition: (data: any) => {
                          const presetField =
                            transformConfig.presetFieldName || 'transformationPreset'
                          const hasPresets =
                            data[presetField] &&
                            (Array.isArray(data[presetField]) ? data[presetField].length > 0 : true)
                          return (
                            hasPresets &&
                            data.isPrivate === true &&
                            data[
                              transformConfig.publicTransformation?.fieldName ||
                                'hasPublicTransformation'
                            ] === true
                          )
                        },
                      },
                    },
                  ]
                : []),
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
      modifiedConfig.collections = modifiedConfig.collections.map((collection) => {
        const collectionConfig = options.collections[collection.slug]
        if (!collectionConfig) return collection

        const rawConfig = typeof collectionConfig === 'boolean' ? {} : collectionConfig
        const config = normalizeCollectionConfig(rawConfig)
        const endpoints = [...(collection.endpoints || [])]

        // Add signed URL endpoints if private files are enabled
        if (config.privateFiles) {
          endpoints.push(
            createSignedURLEndpoint(collection.slug, options),
            createBatchSignedURLEndpoint(collection.slug, options),
          )
        }

        // Add upload status endpoints if queue is enabled
        if (config.uploadQueue?.enabled) {
          endpoints.push(
            createUploadStatusEndpoint(collection.slug),
            createCancelUploadEndpoint(collection.slug),
          )
        }

        // Add hooks
        const transformConfig = getTransformationConfig(config)
        const hooks = { ...(collection.hooks || {}) }

        // Always add beforeValidate hook to preserve Cloudinary data during updates
        hooks.beforeValidate = [
          ...(hooks.beforeValidate || []),
          createBeforeValidateHook(collection.slug, config),
        ]

        // Always add beforeChange hook to handle file preservation and folder moves
        hooks.beforeChange = [
          ...(hooks.beforeChange || []),
          createBeforeChangeHook(collection.slug, config),
        ]

        // Add afterChange hook for privacy changes if private files are enabled
        if (config.privateFiles) {
          hooks.afterChange = [
            ...(hooks.afterChange || []),
            createAfterChangeHook(collection.slug, config),
          ]
        }

        // Add afterRead hook for dynamic URL generation with presets
        if (transformConfig.enablePresetSelection && transformConfig.preserveOriginal) {
          hooks.afterRead = [
            ...(hooks.afterRead || []),
            createAfterReadHook(collection.slug, config),
          ]
        }

        return {
          ...collection,
          endpoints,
          hooks,
        }
      })
    }

    return modifiedConfig
  }
}

export type {
  CloudinaryStorageOptions,
  CloudinaryCollectionConfig,
  TransformationPreset,
  SignedURLConfig,
  FolderConfig,
} from './types.js'
export { getTransformationUrl, commonPresets } from './helpers/transformations.js'
export { generateSignedURL, generateDownloadURL, isAccessAllowed } from './helpers/signedURLs.js'
export { getCloudinaryFolders } from './helpers/getCloudinaryFolders.js'
export {
  fetchSignedURL,
  fetchSignedURLs,
  useSignedURL,
  requiresSignedURL,
  getImageURL,
  createPrivateImageComponent,
} from './helpers/clientHelpers.js'
export {
  getSignedURL,
  getSignedURLs,
  applyTransformationsToUrl,
  getImageURL as getServerImageURL,
  getPrivateImageURL,
  getPublicPreviewURL,
  getPremiumImageURL,
} from './helpers/serverHelpers.js'

import { cloudStoragePlugin } from '@payloadcms/plugin-cloud-storage'
import { CLOUDINARY_DELIVERY_TYPES, type CloudinaryStorageOptions } from './types.js'
import type { CollectionConfig, Config, SelectType, StorageAdapter } from 'payload'
import { getSelectMode } from 'payload/shared'
import { createUploadHandler } from './handlers/handleUpload.js'
import { createDeleteHandler } from './handlers/handleDelete.js'
import { createURLGenerator } from './handlers/generateURL.js'
import { createStaticHandler } from './handlers/staticHandler.js'
import { createCopyFile, createDeleteFile } from './handlers/fileOperations.js'
import { createSignedURLEndpoint, createBatchSignedURLEndpoint } from './endpoints/signedURL.js'
import { createUploadStatusEndpoint, createCancelUploadEndpoint } from './endpoints/uploadStatus.js'
import {
  normalizeCollectionConfig,
  getFolderConfig,
  getTransformationConfig,
  fieldNamesOf,
  warnDeprecatedSettings,
} from './helpers/normalizeConfig.js'
import { createBeforeChangeHook } from './hooks/beforeChange.js'
import { createAfterChangeHook } from './hooks/afterChange.js'
import { createAfterErrorHook } from './hooks/afterError.js'
import { createAfterReadHook, pluginReadSelect } from './hooks/afterRead.js'
import { createBeforeReadHook } from './hooks/beforeRead.js'
import { createBeforeValidateHook } from './hooks/beforeValidate.js'
import {
  createRecordDeletedAssetHook,
  createRecordPreviousAssetHook,
  createRecordUpdateTargetHook,
} from './hooks/recordAssets.js'
import { PLUGIN_CONFIG_KEY } from './helpers/accessRule.js'
import { pluginFieldOf } from './helpers/pluginFields.js'
import { v2 as cloudinary } from 'cloudinary'

/**
 * Field access for every field the plugin writes itself. An access-enforced create or update
 * (REST, GraphQL, or the Local API with `overrideAccess: false`) drops the caller's value, so
 * nobody can point a document at another asset or forge its type. Payload applies this in the
 * field `beforeValidate` pass, before the collection hooks run, so the values the upload handler
 * and the plugin's hooks set afterwards are stored. The Local API skips field access by default
 * (`overrideAccess: true`), so trusted server code can still write these fields.
 */
const writtenByPlugin = { create: () => false, update: () => false }

/**
 * Gives each field the access PLUGIN_FIELDS (pluginFields.ts) lists for its name: writtenByPlugin,
 * and no read for a stored delivery URL, since that is a permanent link. A field the list gives
 * neither keeps the access it has.
 */
function withPluginAccess<T extends { name: string }>(fields: T[]): T[] {
  return fields.map((field) => {
    const listed = pluginFieldOf(field.name)
    if (!listed?.writtenByPlugin && !listed?.hiddenFromReads) return field
    const access = listed.hiddenFromReads
      ? { ...(listed.writtenByPlugin ? writtenByPlugin : {}), read: () => false }
      : writtenByPlugin
    return { ...field, access }
  })
}

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
  warnDeprecatedSettings(options)

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
            deleteFile: createDeleteFile(options),
            copyFile: createCopyFile(),
            generateURL: createURLGenerator(options),
            staticHandler: createStaticHandler(),
            prefix,
            name: 'cloudinary',
            fields: withPluginAccess([
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
              {
                name: 'cloudinaryType',
                type: 'select',
                options: [...CLOUDINARY_DELIVERY_TYPES],
                admin: {
                  hidden: true,
                  readOnly: true,
                },
              },
              // The untransformed URL, built at read time. Virtual: Payload v4's `original`
              // group stores `original.url` in the column a stored `originalUrl` used
              // (`original_url` on the SQL adapters), so 1.x values now read as `original.url`.
              {
                name: 'originalUrl',
                type: 'text',
                virtual: true,
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
                    return !!data[fieldNamesOf(transformConfig).transformationPreset]
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
                      name: fieldNamesOf(transformConfig).transformationPreset,
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
                      name: fieldNamesOf(transformConfig).hasPublicTransformation,
                      type: 'checkbox' as const,
                      label: 'Enable Preview',
                      defaultValue: false,
                      admin: {
                        description:
                          'Give readers who may not get the original a signed preview with a watermark or blur',
                        condition: (data: any) => data.isPrivate === true,
                      },
                    },
                    // Add transformation type selector
                    {
                      name: fieldNamesOf(transformConfig).transformationType,
                      type: 'select' as const,
                      label: 'Transformation Type',
                      defaultValue: 'watermark',
                      options: [
                        { label: 'Watermark', value: 'watermark' },
                        { label: 'Blur', value: 'blur' },
                      ],
                      admin: {
                        description: 'Choose the transformation for the preview',
                        condition: (data: any) =>
                          data.isPrivate === true &&
                          data[fieldNamesOf(transformConfig).hasPublicTransformation] === true,
                      },
                    },
                    // Add watermark text field conditionally
                    {
                      name: fieldNamesOf(transformConfig).watermarkText,
                      type: 'text' as const,
                      label: 'Watermark Text',
                      defaultValue:
                        transformConfig.publicTransformation.watermark?.defaultText || '',
                      admin: {
                        description: 'Text to display as the watermark on the preview',
                        condition: (data: any) => {
                          const names = fieldNamesOf(transformConfig)
                          return (
                            data.isPrivate === true &&
                            data[names.hasPublicTransformation] === true &&
                            data[names.transformationType] === 'watermark'
                          )
                        },
                      },
                    },
                    // Set by versions before 1.3.0 and kept for migratePrivateAssets. New uploads
                    // leave it empty, and a reader without the original reads it as null.
                    {
                      name: 'publicTransformationUrl',
                      type: 'text' as const,
                      label: 'Legacy Public Preview URL',
                      admin: {
                        hidden: true,
                        readOnly: true,
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
                    // Built at read time by the afterRead hook, with or without a selected preset
                    {
                      name: 'previewUrl',
                      type: 'text' as const,
                      label: 'Preview URL',
                      admin: {
                        readOnly: true,
                        description:
                          'Signed preview URL with the selected presets and the watermark or blur',
                        condition: (data: any) =>
                          data.isPrivate === true &&
                          data[fieldNamesOf(transformConfig).hasPublicTransformation] === true,
                      },
                    },
                  ]
                : []),
            ]),
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
  // Payload v4 storage adapter: register it under `storage` in the Payload
  // config, not `plugins`. `init` applies the base cloud storage plugin, then
  // adds this adapter's endpoints and hooks.
  const init = (config: Config): Config => {
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
        const hooks = { ...(collection.hooks || {}) }

        // Record the document an update targets before Payload v4 stages its file
        hooks.beforeOperation = [...(hooks.beforeOperation || []), createRecordUpdateTargetHook()]

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

        // Always add afterChange hook to move a file made public to `upload` after the save. It
        // runs after the collection's own afterChange hooks, so a failure there comes first.
        hooks.afterChange = [
          ...(hooks.afterChange || []),
          createAfterChangeHook(collection.slug, config),
        ]

        // Always add afterError hook to move an asset back when a save that moved it fails
        hooks.afterError = [...(hooks.afterError || []), createAfterErrorHook(collection.slug)]

        // Always add beforeRead hook to resolve a legacy record's type before field access runs
        hooks.beforeRead = [...(hooks.beforeRead || []), createBeforeReadHook()]

        // Payload v4 deletes a replaced or deleted document's file by storage key after the
        // operation commits; record which Cloudinary asset that key is first
        hooks.afterChange = [...(hooks.afterChange || []), createRecordPreviousAssetHook(options)]
        hooks.afterDelete = [...(hooks.afterDelete || []), createRecordDeletedAssetHook()]

        // Always add afterRead hook to build URLs at read time and drop the stored ones
        hooks.afterRead = [...(hooks.afterRead || []), createAfterReadHook(collection.slug, config)]

        // A read that selects fields still carries the asset fields the read hooks need.
        // Payload v4 replaced the static forceSelect with this function; it keeps
        // forceSelect's semantics: add the fields to an include-mode select, and leave
        // a missing or exclude-mode select alone. A host `select` function runs first.
        const select: CollectionConfig['select'] = (args) => {
          const selected = collection.select?.(args) ?? args.select
          if (!selected || getSelectMode(selected) === 'exclude') {
            return selected
          }
          return { ...selected, ...pluginReadSelect(config) } as SelectType
        }

        return {
          ...collection,
          endpoints,
          hooks,
          // The server helpers read the access rule's config from here
          custom: { ...collection.custom, [PLUGIN_CONFIG_KEY]: rawConfig },
          select,
        }
      })
    }

    return modifiedConfig
  }

  const adapter: StorageAdapter = {
    name: 'cloudinary',
    collections: Object.keys(options.collections),
    init,
  }

  return adapter
}

export type {
  CloudinaryStorageOptions,
  CloudinaryCollectionConfig,
  TransformationPreset,
  SignedURLConfig,
  FolderConfig,
  CloudinaryDeliveryType,
} from './types.js'
export { getTransformationUrl, commonPresets } from './helpers/transformations.js'
export { generateSignedURL, generateDownloadURL, isAccessAllowed } from './helpers/signedURLs.js'
export { getCloudinaryFolders } from './helpers/getCloudinaryFolders.js'
export { changeDeliveryType } from './helpers/renameAsset.js'
export type { DeliveryAsset } from './helpers/deliveryURL.js'
export { migratePrivateAssets, MigrationStoppedError } from './helpers/migratePrivateAssets.js'
export type {
  MigratePrivateAssetsArgs,
  DocumentRef,
  PublicCopy,
  FailedDocument,
  MigrationReport,
} from './helpers/migratePrivateAssets.js'
export {
  fetchSignedURL,
  fetchSignedURLs,
  useSignedURL,
  requiresSignedURL,
  getImageURL,
  createPrivateImageComponent,
} from './helpers/clientHelpers.js'
export {
  isAccessAllowedByID,
  getSignedURL,
  getSignedURLs,
  applyTransformationsToUrl,
  getImageURL as getServerImageURL,
  getPrivateImageURL,
  getPublicPreviewURL,
  getPremiumImageURL,
} from './helpers/serverHelpers.js'
export type { IsAccessAllowedByIDArgs } from './helpers/serverHelpers.js'

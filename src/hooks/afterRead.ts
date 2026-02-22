import type { CollectionAfterReadHook } from 'payload'
import type { CloudinaryCollectionConfig } from '../types.js'
import { v2 as cloudinary } from 'cloudinary'
import { getTransformationConfig, getSignedURLConfig } from '../helpers/normalizeConfig.js'
import { generateSignedURL } from '../helpers/signedURLs.js'
import {
  buildWatermarkTransformation,
  buildImageWatermarkTransformation,
  buildBlurTransformation,
} from '../helpers/watermark.js'

export const createAfterReadHook =
  (_collectionSlug: string, config: CloudinaryCollectionConfig): CollectionAfterReadHook =>
  async ({ doc }) => {
    if (!doc || !doc.cloudinaryPublicId) {
      return doc
    }

    const transformConfig = getTransformationConfig(config)
    const signedURLConfig = getSignedURLConfig(config)

    // When preserveOriginal is true and preset selection is enabled, generate URLs dynamically
    if (transformConfig.preserveOriginal && transformConfig.enablePresetSelection) {
      const presetField = transformConfig.presetFieldName || 'transformationPreset'
      const selectedPresets = doc[presetField]

      // Build combined transformations from selected presets
      let combinedTransformations: Record<string, any> = {}

      // Start with default transformations if any
      if (transformConfig.default) {
        combinedTransformations = { ...transformConfig.default }
      }

      // Add transformations from selected presets
      if (selectedPresets && transformConfig.presets) {
        // Handle both single and multiple selections
        const presetArray = Array.isArray(selectedPresets) ? selectedPresets : [selectedPresets]

        for (const presetName of presetArray) {
          const preset = transformConfig.presets.find((p) => p.name === presetName)
          if (preset) {
            // Merge transformations (later presets override earlier ones)
            combinedTransformations = { ...combinedTransformations, ...preset.transformations }
          }
        }
      }

      // Generate the URL based on whether we have transformations and privacy settings
      if (Object.keys(combinedTransformations).length > 0) {
        // Generate URL with transformations
        if (doc.isPrivate && signedURLConfig) {
          // Generate signed URL with transformations
          doc.transformedUrl = generateSignedURL(
            {
              publicId: doc.cloudinaryPublicId,
              version: doc.cloudinaryVersion,
              resourceType: doc.cloudinaryResourceType,
              format: doc.cloudinaryFormat,
              transformations: combinedTransformations,
            },
            signedURLConfig,
          )
        } else {
          // Generate public URL with transformations
          doc.transformedUrl = cloudinary.url(doc.cloudinaryPublicId, {
            secure: true,
            version: doc.cloudinaryVersion,
            resource_type: doc.cloudinaryResourceType || 'image',
            transformation: combinedTransformations,
          })
        }
      } else {
        // No transformations selected, clear the transformed URL
        doc.transformedUrl = null
      }
    }

    // Generate preview URL with transformation presets if public transformation is enabled
    if (
      transformConfig.publicTransformation?.enabled &&
      doc.isPrivate &&
      doc[transformConfig.publicTransformation.fieldName || 'hasPublicTransformation'] === true
    ) {
      const presetField = transformConfig.presetFieldName || 'transformationPreset'
      const selectedPresets = doc[presetField]

      if (selectedPresets) {
        // Build combined transformations from selected presets
        let previewTransformations: Record<string, any> = {}

        // Start with default transformations if any
        if (transformConfig.default) {
          previewTransformations = { ...transformConfig.default }
        }

        // Add transformations from selected presets
        if (transformConfig.presets) {
          // Handle both single and multiple selections
          const presetArray = Array.isArray(selectedPresets) ? selectedPresets : [selectedPresets]

          for (const presetName of presetArray) {
            const preset = transformConfig.presets.find((p) => p.name === presetName)
            if (preset) {
              // Merge transformations (later presets override earlier ones)
              previewTransformations = { ...previewTransformations, ...preset.transformations }
            }
          }
        }

        // Get the transformation type (watermark/blur)
        const typeFieldName =
          transformConfig.publicTransformation.typeFieldName || 'transformationType'
        const transformationType = doc[typeFieldName] || 'watermark'

        // Build the public transformation (watermark/blur)
        let publicTransformation
        if (transformationType === 'watermark' && transformConfig.publicTransformation.watermark) {
          const watermarkFieldName =
            transformConfig.publicTransformation.watermark.textFieldName || 'watermarkText'
          const watermarkText = doc[watermarkFieldName]

          if (transformConfig.publicTransformation.watermark.imageId) {
            publicTransformation = buildImageWatermarkTransformation(
              transformConfig.publicTransformation.watermark,
            )
          } else {
            publicTransformation = buildWatermarkTransformation(
              transformConfig.publicTransformation.watermark,
              watermarkText,
            )
          }
        } else if (transformationType === 'blur') {
          publicTransformation = buildBlurTransformation(transformConfig.publicTransformation.blur)
        }

        // Combine preset transformations with public transformation
        if (Object.keys(previewTransformations).length > 0 || publicTransformation) {
          // Cloudinary applies transformations in order, so we apply presets first, then watermark/blur
          const combinedTransformation = []

          // Add preset transformations first
          if (Object.keys(previewTransformations).length > 0) {
            combinedTransformation.push(previewTransformations)
          }

          // Add public transformation (watermark/blur) on top
          if (publicTransformation) {
            if (Array.isArray(publicTransformation)) {
              combinedTransformation.push(...publicTransformation)
            } else {
              combinedTransformation.push(publicTransformation)
            }
          }

          doc.previewUrl = cloudinary.url(doc.cloudinaryPublicId, {
            secure: true,
            version: doc.cloudinaryVersion,
            resource_type: doc.cloudinaryResourceType || 'image',
            type: 'upload', // Always use 'upload' for public URLs
            transformation: combinedTransformation,
          })
        }
      }
    }

    return doc
  }

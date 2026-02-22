import type { CollectionAfterChangeHook } from 'payload'
import type { CloudinaryCollectionConfig } from '../types.js'
import { v2 as cloudinary } from 'cloudinary'
import { generateSignedURL } from '../helpers/signedURLs.js'
import { getSignedURLConfig, getTransformationConfig } from '../helpers/normalizeConfig.js'
import {
  buildWatermarkTransformation,
  buildImageWatermarkTransformation,
  buildBlurTransformation,
} from '../helpers/watermark.js'

export const createAfterChangeHook =
  (collectionSlug: string, config: CloudinaryCollectionConfig): CollectionAfterChangeHook =>
  async ({ doc, previousDoc, req }) => {
    // Debug logging for transformation changes
    if (doc.cloudinaryPublicId) {
      req.payload.logger.info({
        msg: 'AfterChange hook triggered',
        collection: collectionSlug,
        cloudinaryPublicId: doc.cloudinaryPublicId,
        hasCloudinaryUrl: !!doc.cloudinaryUrl,
        operation: previousDoc ? 'update' : 'create',
        previousUrl: previousDoc?.url,
        currentUrl: doc.url,
        urlChanged: previousDoc?.url !== doc.url,
      })
    }

    // Check if we need to update URLs
    const privacyChanged = previousDoc?.isPrivate !== doc.isPrivate
    const transformConfig = getTransformationConfig(config)
    const presetFieldName = transformConfig.presetFieldName || 'transformationPreset'
    // For hasMany fields, we need to compare arrays properly
    const currentPresets = doc[presetFieldName]
    const previousPresets = previousDoc?.[presetFieldName]
    const presetChanged = JSON.stringify(currentPresets) !== JSON.stringify(previousPresets)
    const publicPreviewFieldName =
      transformConfig.publicTransformation?.fieldName || 'hasPublicTransformation'
    const publicPreviewChanged =
      previousDoc?.[publicPreviewFieldName] !== doc[publicPreviewFieldName]
    const watermarkFieldName =
      transformConfig.publicTransformation?.watermark?.textFieldName || 'watermarkText'
    const watermarkChanged = previousDoc?.[watermarkFieldName] !== doc[watermarkFieldName]
    const typeFieldName =
      transformConfig.publicTransformation?.typeFieldName || 'transformationType'
    const typeChanged = previousDoc?.[typeFieldName] !== doc[typeFieldName]

    if (
      !doc.cloudinaryPublicId ||
      (!privacyChanged &&
        !presetChanged &&
        !publicPreviewChanged &&
        !watermarkChanged &&
        !typeChanged)
    ) {
      return doc
    }

    // Log what changes triggered the URL update
    req.payload.logger.info({
      msg: 'Updating URLs due to changes',
      collection: collectionSlug,
      cloudinaryPublicId: doc.cloudinaryPublicId,
      changes: {
        privacyChanged,
        presetChanged,
        publicPreviewChanged,
        watermarkChanged,
        typeChanged,
      },
    })

    const signedURLConfig = getSignedURLConfig(config)

    // Only update main URLs if privacy changed
    if (privacyChanged) {
      // Update URLs based on new privacy settings
      if (doc.isPrivate && signedURLConfig) {
        // File is now private - generate signed URLs
        doc.requiresSignedURL = true

        // Update the main URL to be a signed URL
        doc.url = generateSignedURL(
          {
            publicId: doc.cloudinaryPublicId,
            version: doc.cloudinaryVersion,
            resourceType: doc.cloudinaryResourceType,
            format: doc.cloudinaryFormat,
            transformations: transformConfig.default,
          },
          signedURLConfig,
        )

        // Update original URL to be signed as well
        doc.originalUrl = generateSignedURL(
          {
            publicId: doc.cloudinaryPublicId,
            version: doc.cloudinaryVersion,
            resourceType: doc.cloudinaryResourceType,
            format: doc.cloudinaryFormat,
            // No transformations for original
          },
          signedURLConfig,
        )
      } else {
        // File is now public - generate regular URLs
        doc.requiresSignedURL = false

        // Update the main URL to be a regular URL
        if (transformConfig.default && Object.keys(transformConfig.default).length > 0) {
          doc.url = cloudinary.url(doc.cloudinaryPublicId, {
            secure: true,
            version: doc.cloudinaryVersion,
            resource_type: doc.cloudinaryResourceType,
            transformation: transformConfig.default,
          })
        } else {
          doc.url = cloudinary.url(doc.cloudinaryPublicId, {
            secure: true,
            version: doc.cloudinaryVersion,
            resource_type: doc.cloudinaryResourceType,
          })
        }

        // Update original URL to be a regular URL
        doc.originalUrl = cloudinary.url(doc.cloudinaryPublicId, {
          secure: true,
          version: doc.cloudinaryVersion,
          resource_type: doc.cloudinaryResourceType,
          type: 'upload',
          format: doc.cloudinaryFormat,
        })
      }
    }

    // Update URL if preset changed and preserveOriginal is true
    if (
      transformConfig.preserveOriginal &&
      transformConfig.enablePresetSelection &&
      presetChanged
    ) {
      // Build combined transformations from selected presets
      let combinedTransformations: Record<string, any> = {}

      // Start with default transformations if any
      if (transformConfig.default) {
        combinedTransformations = { ...transformConfig.default }
      }

      // Add transformations from selected presets
      if (doc[presetFieldName] && transformConfig.presets) {
        // Handle both single and multiple selections
        const presetArray = Array.isArray(doc[presetFieldName])
          ? doc[presetFieldName]
          : [doc[presetFieldName]]

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

    // Update public transformation URL if needed
    if (
      transformConfig.publicTransformation?.enabled &&
      (publicPreviewChanged || watermarkChanged || typeChanged)
    ) {
      const fieldName = transformConfig.publicTransformation.fieldName || 'hasPublicTransformation'

      if (doc[fieldName] === true && doc.isPrivate) {
        // Upload a permanently transformed version
        req.payload.logger.info({
          msg: 'Creating permanently transformed public version',
          collection: collectionSlug,
          transformationType: doc[typeFieldName] || 'watermark',
        })

        try {
          // Delete old public transformation if it exists
          if (doc.publicTransformationPublicId) {
            try {
              await cloudinary.uploader.destroy(doc.publicTransformationPublicId, {
                resource_type: doc.cloudinaryResourceType || 'image',
                invalidate: true,
              })
              req.payload.logger.info({
                msg: 'Deleted old public transformation',
                publicId: doc.publicTransformationPublicId,
              })
            } catch (error) {
              req.payload.logger.warn({
                msg: 'Failed to delete old public transformation',
                error: error instanceof Error ? error.message : 'Unknown error',
              })
            }
          }

          let publicTransformation

          // Get the transformation type
          const typeFieldName =
            transformConfig.publicTransformation.typeFieldName || 'transformationType'
          const transformationType = doc[typeFieldName] || 'watermark'

          if (
            transformationType === 'watermark' &&
            transformConfig.publicTransformation.watermark
          ) {
            const watermarkFieldName =
              transformConfig.publicTransformation.watermark.textFieldName || 'watermarkText'
            const watermarkText = doc[watermarkFieldName]

            // Build watermark transformation
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
            // Build blur transformation
            publicTransformation = buildBlurTransformation(
              transformConfig.publicTransformation.blur,
            )
          }

          // Create a new public ID for the transformed version
          const publicTransformationPublicId = `${doc.cloudinaryPublicId}_public_${transformationType}`

          // Generate a URL with the transformation applied
          const transformedUrl = cloudinary.url(doc.cloudinaryPublicId, {
            secure: true,
            transformation: publicTransformation,
            format: doc.cloudinaryFormat || 'jpg',
          })

          // Upload the transformed version as a new permanent image
          const transformedResult = await cloudinary.uploader.upload(transformedUrl, {
            public_id: publicTransformationPublicId,
            resource_type: doc.cloudinaryResourceType || 'image',
            overwrite: true,
            invalidate: true,
          })

          if (transformedResult && transformedResult.secure_url) {
            // Store the public transformation URL and public ID
            doc.publicTransformationUrl = transformedResult.secure_url
            doc.publicTransformationPublicId = publicTransformationPublicId

            // Also set this as the preview URL since it's the permanently transformed version
            doc.previewUrl = transformedResult.secure_url

            req.payload.logger.info({
              msg: 'Public transformation created successfully',
              publicId: publicTransformationPublicId,
              url: doc.publicTransformationUrl,
              previewUrl: doc.previewUrl,
              docId: doc.id,
              willReturn: true,
            })
          }
        } catch (error) {
          req.payload.logger.error({
            msg: 'Failed to create public transformation',
            error: error instanceof Error ? error.message : 'Unknown error',
          })
          doc.publicTransformationUrl = null
          doc.publicTransformationPublicId = null
          doc.previewUrl = null
        }
      } else {
        // Clean up if public transformation is disabled
        if (doc.publicTransformationPublicId) {
          try {
            await cloudinary.uploader.destroy(doc.publicTransformationPublicId, {
              resource_type: doc.cloudinaryResourceType || 'image',
              invalidate: true,
            })
            req.payload.logger.info({
              msg: 'Deleted public transformation (disabled)',
              publicId: doc.publicTransformationPublicId,
            })
          } catch (error) {
            req.payload.logger.warn({
              msg: 'Failed to delete public transformation',
              error: error instanceof Error ? error.message : 'Unknown error',
            })
          }
        }
        doc.publicTransformationUrl = null
        doc.publicTransformationPublicId = null
        doc.previewUrl = null
      }
    }

    // Generate preview URL with transformation presets if public transformation is enabled and any relevant field changed
    // Skip if we already have a preview URL from the permanent public transformation
    if (
      transformConfig.publicTransformation?.enabled &&
      doc.isPrivate &&
      doc[publicPreviewFieldName] === true &&
      (presetChanged || publicPreviewChanged || watermarkChanged || typeChanged) &&
      !doc.previewUrl
    ) {
      const selectedPresets = doc[presetFieldName]

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
        const transformationType = doc[typeFieldName] || 'watermark'

        // Build the public transformation (watermark/blur)
        let publicTransformation
        if (transformationType === 'watermark' && transformConfig.publicTransformation.watermark) {
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
        } else {
          doc.previewUrl = null
        }
      }
    }

    // Log what we're returning
    if (doc.publicTransformationUrl) {
      req.payload.logger.info({
        msg: 'AfterChange hook returning doc with public transformation',
        publicTransformationUrl: doc.publicTransformationUrl,
        publicTransformationPublicId: doc.publicTransformationPublicId,
      })
    }

    return doc
  }

import type { GenerateURL } from '@payloadcms/plugin-cloud-storage/types'
import type { CloudinaryStorageOptions } from '../types.js'
import { buildDeliveryURL, deliveryAssetOf, isPrivateFile } from '../helpers/deliveryURL.js'
import { normalizeCollectionConfig, getTransformationConfig } from '../helpers/normalizeConfig.js'

export const createURLGenerator =
  (options: CloudinaryStorageOptions): GenerateURL =>
  ({ collection, filename, prefix, data }) => {
    const collectionConfig = options.collections[collection.slug]

    if (!collectionConfig) {
      return filename
    }

    const rawConfig = typeof collectionConfig === 'boolean' ? {} : collectionConfig
    const config = normalizeCollectionConfig(rawConfig)
    const transformConfig = getTransformationConfig(config)

    // A private file gets its URLs from the afterRead hook, after the access check. This
    // handler has no request, so it hands out nothing for one.
    if (config.privateFiles && isPrivateFile(data ?? {})) {
      return ''
    }

    try {
      const transformations: Record<string, any> = {
        ...(transformConfig.default || {}),
      }

      if (transformations.format === 'auto' || transformations.fetchFormat === 'auto') {
        transformations.fetch_format = 'auto'
        delete transformations.format
      }

      if (transformations.quality === 'auto') {
        transformations.quality = 'auto'
      }

      // Use the stored asset. Without a stored public_id, derive it from the prefix and filename.
      const stored = deliveryAssetOf(data ?? {})
      const stem = filename.substring(0, filename.lastIndexOf('.'))
      const asset = data?.cloudinaryPublicId
        ? stored
        : { ...stored, publicId: prefix ? `${prefix}/${stem}` : stem }

      return buildDeliveryURL(asset, {
        transformation: Object.keys(transformations).length > 0 ? transformations : undefined,
      })
    } catch (error) {
      console.error('[Cloudinary URL] Error generating URL:', error)
      return filename
    }
  }

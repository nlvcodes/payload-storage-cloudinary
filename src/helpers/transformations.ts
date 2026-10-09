import type {
  CloudinaryDeliveryType,
  TransformationConfig,
  TransformationPreset,
} from '../types.js'
import { buildDeliveryURL } from './deliveryURL.js'
import { fieldNamesOf } from './normalizeConfig.js'

// Re-export commonPresets from clientTransformations (single source of truth, no cloudinary dependency)
export { commonPresets } from './clientTransformations.js'

export interface TransformOptions {
  publicId: string
  version?: number
  presetName?: string
  presets?: TransformationPreset[]
  customTransformations?: Record<string, any>
  /** The asset's stored Cloudinary type. Defaults to `upload`; pass `authenticated` for a private asset. */
  deliveryType?: CloudinaryDeliveryType
}

/**
 * Builds a delivery URL for any public ID with the preset and custom transformations merged in.
 *
 * A primitive: it checks no access and no transformation. With `deliveryType: 'authenticated'` it
 * signs whatever it is given, so the URL delivers a private original, and an `overlay` or
 * `underlay` can name another private asset. Only trusted server code may call it, and never with
 * a public ID or transformations taken from a request. To serve a reader, use `getSignedURL` or
 * `getServerImageURL`, which apply the access rule and the transformation allowlist.
 */
export function getTransformationUrl(options: TransformOptions): string {
  const { publicId, version, presetName, presets, customTransformations, deliveryType } = options

  let transformations: Record<string, any> = {}

  // Apply preset transformations if specified
  if (presetName && presets) {
    const preset = presets.find((p) => p.name === presetName)
    if (preset) {
      transformations = { ...preset.transformations }
    }
  }

  // Merge with custom transformations
  if (customTransformations) {
    transformations = { ...transformations, ...customTransformations }
  }

  return buildDeliveryURL(
    { publicId, version, deliveryType: deliveryType ?? 'upload' },
    { transformation: Object.keys(transformations).length > 0 ? transformations : undefined },
  )
}

/**
 * The collection's default transformations merged with the document's selected presets, in
 * selection order, so a later preset overrides an earlier one. Undefined when there are none.
 */
export function selectedTransformations(
  doc: Record<string, any>,
  transformConfig: TransformationConfig,
): Record<string, any> | undefined {
  const selected = doc?.[fieldNamesOf(transformConfig).transformationPreset]
  const names: string[] = selected ? (Array.isArray(selected) ? selected : [selected]) : []

  let transformations: Record<string, any> = { ...transformConfig.default }
  for (const name of names) {
    const preset = transformConfig.presets?.find((p) => p.name === name)
    if (preset) transformations = { ...transformations, ...preset.transformations }
  }

  return Object.keys(transformations).length > 0 ? transformations : undefined
}

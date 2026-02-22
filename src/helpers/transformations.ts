import type { TransformationPreset } from '../types.js'
import { v2 as cloudinary } from 'cloudinary'

// Re-export commonPresets from clientTransformations (single source of truth, no cloudinary dependency)
export { commonPresets } from './clientTransformations.js'

export interface TransformOptions {
  publicId: string
  version?: number
  presetName?: string
  presets?: TransformationPreset[]
  customTransformations?: Record<string, any>
}

export function getTransformationUrl(options: TransformOptions): string {
  const { publicId, version, presetName, presets, customTransformations } = options

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

  // Generate URL with transformations
  const urlOptions: any = {
    secure: true,
    transformation: Object.keys(transformations).length > 0 ? transformations : undefined,
  }

  if (version) {
    urlOptions.version = version
  }

  return cloudinary.url(publicId, urlOptions)
}

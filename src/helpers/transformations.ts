import type { TransformationPreset } from '../types.js'
import { v2 as cloudinary } from 'cloudinary'

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
    const preset = presets.find(p => p.name === presetName)
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

export const commonPresets: TransformationPreset[] = [
  {
    name: 'thumbnail',
    label: 'Thumbnail',
    description: 'Small thumbnail for lists and grids',
    transformations: {
      width: 150,
      height: 150,
      crop: 'fill',
      gravity: 'auto',
      quality: 'auto',
      fetch_format: 'auto',
    },
  },
  {
    name: 'card',
    label: 'Card Image',
    description: 'Medium size for cards and previews',
    transformations: {
      width: 400,
      height: 300,
      crop: 'fill',
      gravity: 'auto',
      quality: 'auto:good',
      fetch_format: 'auto',
    },
  },
  {
    name: 'hero',
    label: 'Hero Image',
    description: 'Large hero/banner image',
    transformations: {
      width: 1920,
      height: 600,
      crop: 'fill',
      gravity: 'auto',
      quality: 'auto:good',
      fetch_format: 'auto',
      dpr: 'auto',
    },
  },
  {
    name: 'responsive',
    label: 'Responsive',
    description: 'Responsive image with automatic sizing',
    transformations: {
      width: 'auto',
      quality: 'auto',
      fetch_format: 'auto',
      dpr: 'auto',
      responsive: true,
      sizes: '100vw',
    },
  },
  {
    name: 'watermarked',
    label: 'Watermarked',
    description: 'Add watermark overlay',
    transformations: {
      quality: 'auto:good',
      fetch_format: 'auto',
      overlay: {
        font_family: 'Arial',
        font_size: 40,
        font_weight: 'bold',
        text: '© Your Company',
        opacity: 30,
        color: 'white',
      },
      gravity: 'south_east',
      x: 10,
      y: 10,
    },
  },
  {
    name: 'blurred',
    label: 'Blurred Background',
    description: 'Blurred version for backgrounds',
    transformations: {
      quality: 'auto:low',
      fetch_format: 'auto',
      effect: 'blur:1000',
      width: 800,
    },
  },
  {
    name: 'grayscale',
    label: 'Grayscale',
    description: 'Convert to black and white',
    transformations: {
      quality: 'auto',
      fetch_format: 'auto',
      effect: 'grayscale',
    },
  },
  {
    name: 'rounded',
    label: 'Rounded Corners',
    description: 'Image with rounded corners',
    transformations: {
      width: 300,
      height: 300,
      crop: 'fill',
      gravity: 'face',
      radius: 'max',
      quality: 'auto',
      fetch_format: 'auto',
    },
  },
]
/**
 * Client-safe transformation utilities
 * These functions build Cloudinary URLs without importing the cloudinary package
 */

import type { TransformationPreset } from '../types.js'

export interface TransformOptions {
  publicId: string
  version?: number
  presetName?: string
  presets?: TransformationPreset[]
  customTransformations?: Record<string, any>
  cloudName?: string
}

/**
 * Build a Cloudinary URL without using the cloudinary package
 * Safe for use in client components
 */
export function getTransformationUrl(options: TransformOptions): string {
  const { publicId, version, presetName, presets, customTransformations, cloudName } = options

  // Get cloud name from environment if not provided
  const cloud = cloudName || process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || ''

  if (!cloud) {
    throw new Error(
      'Cloud name is required. Provide it via the cloudName option or set NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME.',
    )
  }

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

  // Build transformation string
  const transformString = buildTransformationString(transformations)

  // Build the URL
  let url = `https://res.cloudinary.com/${cloud}/image/upload`

  if (transformString) {
    url += `/${transformString}`
  }

  if (version) {
    url += `/v${version}`
  }

  url += `/${publicId}`

  return url
}

/**
 * Build transformation string from object
 */
function buildTransformationString(transformations: Record<string, any>): string {
  if (!transformations || Object.keys(transformations).length === 0) {
    return ''
  }

  const parts: string[] = []

  Object.entries(transformations).forEach(([key, value]) => {
    // Map common transformation keys to Cloudinary format
    switch (key) {
      case 'width':
        parts.push(`w_${value}`)
        break
      case 'height':
        parts.push(`h_${value}`)
        break
      case 'crop':
        parts.push(`c_${value}`)
        break
      case 'quality':
        if (value === 'auto' || value.startsWith('auto:')) {
          parts.push(`q_${value}`)
        } else {
          parts.push(`q_${value}`)
        }
        break
      case 'format':
        parts.push(`f_${value}`)
        break
      case 'fetch_format':
        if (value === 'auto') {
          parts.push('f_auto')
        } else {
          parts.push(`f_${value}`)
        }
        break
      case 'gravity':
        parts.push(`g_${value}`)
        break
      case 'radius':
        parts.push(`r_${value}`)
        break
      case 'angle':
        parts.push(`a_${value}`)
        break
      case 'effect':
        parts.push(`e_${value}`)
        break
      case 'opacity':
        parts.push(`o_${value}`)
        break
      case 'border':
        parts.push(`bo_${value}`)
        break
      case 'background':
        parts.push(`b_${value}`)
        break
      case 'overlay':
        parts.push(`l_${value}`)
        break
      case 'underlay':
        parts.push(`u_${value}`)
        break
      case 'dpr':
        if (value === 'auto') {
          parts.push('dpr_auto')
        } else {
          parts.push(`dpr_${value}`)
        }
        break
      case 'aspect_ratio':
        parts.push(`ar_${value}`)
        break
      case 'x':
        parts.push(`x_${value}`)
        break
      case 'y':
        parts.push(`y_${value}`)
        break
      default:
        // For any other transformations, use the key as-is
        parts.push(`${key}_${value}`)
    }
  })

  return parts.join(',')
}

// Re-export common presets (these don't depend on cloudinary)
export const commonPresets: TransformationPreset[] = [
  // Size presets
  {
    name: 'thumbnail',
    label: 'Thumbnail',
    category: 'size',
    description: 'Small thumbnail (150x150) - Note: Only one size preset will be applied',
    transformations: {
      width: 150,
      height: 150,
      crop: 'thumb',
      gravity: 'auto',
    },
  },
  {
    name: 'card',
    label: 'Card',
    category: 'size',
    description: 'Medium card size (400x400) - Note: Only one size preset will be applied',
    transformations: {
      width: 400,
      height: 400,
      crop: 'fill',
      gravity: 'auto',
    },
  },
  {
    name: 'banner',
    label: 'Banner',
    category: 'size',
    description: 'Wide banner (1200x600) - Note: Only one size preset will be applied',
    transformations: {
      width: 1200,
      height: 600,
      crop: 'fill',
      gravity: 'auto',
      quality: 'auto:good',
    },
  },
  {
    name: 'hero',
    label: 'Hero Image',
    category: 'size',
    description: 'Full-width hero (1920x600) - Note: Only one size preset will be applied',
    transformations: {
      width: 1920,
      height: 600,
      crop: 'fill',
      gravity: 'auto',
      quality: 'auto:good',
    },
  },
  {
    name: 'feature',
    label: 'Feature Image',
    category: 'size',
    description: 'Large feature image (800x600) - Note: Only one size preset will be applied',
    transformations: {
      width: 800,
      height: 600,
      crop: 'fill',
      gravity: 'auto',
    },
  },

  // Social media presets
  {
    name: 'og-image',
    label: 'Open Graph',
    category: 'social',
    description: 'Open Graph image (1200x630) for social sharing',
    transformations: {
      width: 1200,
      height: 630,
      crop: 'fill',
      gravity: 'auto',
      quality: 'auto:good',
      format: 'jpg',
    },
  },
  {
    name: 'twitter-card',
    label: 'Twitter Card',
    category: 'social',
    description: 'Twitter summary card (1200x675)',
    transformations: {
      width: 1200,
      height: 675,
      crop: 'fill',
      gravity: 'auto',
    },
  },
  {
    name: 'instagram-square',
    label: 'Instagram Square',
    category: 'social',
    description: 'Instagram square post (1080x1080)',
    transformations: {
      width: 1080,
      height: 1080,
      crop: 'fill',
      gravity: 'auto',
    },
  },
  {
    name: 'instagram-story',
    label: 'Instagram Story',
    category: 'social',
    description: 'Instagram story size (1080x1920)',
    transformations: {
      width: 1080,
      height: 1920,
      crop: 'fill',
      gravity: 'auto',
    },
  },

  // Aspect ratio presets
  {
    name: 'square',
    label: 'Square (1:1)',
    category: 'aspect-ratio',
    description: 'Square aspect ratio - Note: Only one aspect ratio will be applied',
    transformations: {
      aspect_ratio: '1:1',
      crop: 'fill',
      gravity: 'auto',
    },
  },
  {
    name: 'landscape-16-9',
    label: 'Landscape 16:9',
    category: 'aspect-ratio',
    description: 'Widescreen aspect ratio - Note: Only one aspect ratio will be applied',
    transformations: {
      aspect_ratio: '16:9',
      crop: 'fill',
      gravity: 'auto',
    },
  },
  {
    name: 'landscape-4-3',
    label: 'Landscape 4:3',
    category: 'aspect-ratio',
    description: 'Standard landscape ratio - Note: Only one aspect ratio will be applied',
    transformations: {
      aspect_ratio: '4:3',
      crop: 'fill',
      gravity: 'auto',
    },
  },
  {
    name: 'portrait-9-16',
    label: 'Portrait 9:16',
    category: 'aspect-ratio',
    description: 'Vertical video/story ratio - Note: Only one aspect ratio will be applied',
    transformations: {
      aspect_ratio: '9:16',
      crop: 'fill',
      gravity: 'auto',
    },
  },

  // Effect presets
  {
    name: 'blur',
    label: 'Blur',
    category: 'effect',
    description: 'Blurred effect - Note: Only one effect preset will be applied',
    transformations: {
      effect: 'blur:1000',
      quality: 30,
    },
  },
  {
    name: 'grayscale',
    label: 'Grayscale',
    category: 'effect',
    description: 'Black and white - Note: Only one effect preset will be applied',
    transformations: {
      effect: 'grayscale',
    },
  },
  {
    name: 'sepia',
    label: 'Sepia',
    category: 'effect',
    description: 'Sepia tone - Note: Only one effect preset will be applied',
    transformations: {
      effect: 'sepia',
    },
  },
  {
    name: 'pixelate',
    label: 'Pixelate',
    category: 'effect',
    description: 'Pixelated effect - Note: Only one effect preset will be applied',
    transformations: {
      effect: 'pixelate:20',
    },
  },
  {
    name: 'sharpen',
    label: 'Sharpen',
    category: 'effect',
    description: 'Sharpen image - Note: Only one effect preset will be applied',
    transformations: {
      effect: 'sharpen',
    },
  },
  {
    name: 'vignette',
    label: 'Vignette',
    category: 'effect',
    description: 'Dark edges vignette - Note: Only one effect preset will be applied',
    transformations: {
      effect: 'vignette:50',
    },
  },

  // Optimization presets
  {
    name: 'auto-optimize',
    label: 'Auto Optimize',
    category: 'optimization',
    description: 'Automatic quality and format optimization',
    transformations: {
      quality: 'auto',
      fetch_format: 'auto',
    },
  },
  {
    name: 'high-quality',
    label: 'High Quality',
    category: 'optimization',
    description: 'Best quality with auto format',
    transformations: {
      quality: 'auto:best',
      fetch_format: 'auto',
    },
  },
  {
    name: 'balanced',
    label: 'Balanced Quality',
    category: 'optimization',
    description: 'Good balance of quality and file size',
    transformations: {
      quality: 'auto:good',
      fetch_format: 'auto',
    },
  },
  {
    name: 'eco-mode',
    label: 'Eco Mode',
    category: 'optimization',
    description: 'Lower quality for faster loading',
    transformations: {
      quality: 'auto:eco',
      fetch_format: 'auto',
    },
  },
  {
    name: 'progressive',
    label: 'Progressive JPEG',
    category: 'optimization',
    description: 'Progressive loading for better perceived performance',
    transformations: {
      quality: 'auto:good',
      format: 'jpg',
      flags: 'progressive',
    },
  },

  // Special presets
  {
    name: 'avatar',
    label: 'Avatar',
    category: 'size',
    description:
      'Circular avatar with face detection (200x200) - Note: Only one size preset will be applied',
    transformations: {
      width: 200,
      height: 200,
      crop: 'thumb',
      gravity: 'face',
      radius: 'max',
    },
  },
  {
    name: 'profile-header',
    label: 'Profile Header',
    category: 'size',
    description:
      'Profile header/cover image (1500x500) - Note: Only one size preset will be applied',
    transformations: {
      width: 1500,
      height: 500,
      crop: 'fill',
      gravity: 'auto',
      quality: 'auto:good',
    },
  },
]

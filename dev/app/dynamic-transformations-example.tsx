import { getPayload } from "payload"
import config from '@payload-config'
import { getTransformationUrl, commonPresets } from 'payload-storage-cloudinary'

// Example: Dynamic transformation based on context
export async function DynamicImageExample() {
  const payload = await getPayload({ config })
  
  // Get a media item
  const media = await payload.findByID({
    collection: 'media',
    id: 'some-media-id',
  })

  // 1. Use the URL with default transformations (applied at upload)
  const defaultUrl = media.url // This has the default transformations from config

  // 2. Create dynamic transformations based on usage context
  const contexts = {
    // Hero image for desktop
    heroDesktop: {
      width: 1920,
      height: 600,
      crop: 'fill',
      gravity: 'auto',
      quality: 'auto:best',
      fetch_format: 'auto',
    },
    // Hero image for mobile
    heroMobile: {
      width: 640,
      height: 400,
      crop: 'fill',
      gravity: 'auto',
      quality: 'auto',
      fetch_format: 'auto',
    },
    // Product grid
    productGrid: {
      width: 400,
      height: 400,
      crop: 'fill',
      gravity: 'auto',
      quality: 'auto',
      fetch_format: 'auto',
    },
    // Social media share
    openGraph: {
      width: 1200,
      height: 630,
      crop: 'fill',
      gravity: 'center',
      quality: 'auto:best',
    },
  }

  // Apply context-based transformation
  const heroDesktopUrl = getTransformationUrl({
    publicId: media.cloudinaryPublicId!,
    version: media.cloudinaryVersion || undefined,
    customTransformations: contexts.heroDesktop,
  })

  return (
    <div>
      {/* Responsive image with different transformations */}
      <picture>
        <source
          media="(max-width: 640px)"
          srcSet={getTransformationUrl({
            publicId: media.cloudinaryPublicId!,
            version: media.cloudinaryVersion || undefined,
            customTransformations: contexts.heroMobile,
          })}
        />
        <img
          src={heroDesktopUrl}
          alt={media.alt || ''}
        />
      </picture>
    </div>
  )
}

// Example: Using stored transformation preset
export async function PresetBasedExample() {
  const payload = await getPayload({ config })
  
  // If you have enablePresetSelection: true in your config,
  // the selected preset is stored in the document
  const media = await payload.findByID({
    collection: 'media',
    id: 'some-media-id',
  })

  // Check if a preset was selected during upload
  const selectedPreset = (media as any).transformationPreset

  if (selectedPreset && commonPresets) {
    // Apply the selected preset
    const presetUrl = getTransformationUrl({
      publicId: media.cloudinaryPublicId!,
      version: media.cloudinaryVersion || undefined,
      presetName: selectedPreset,
      presets: commonPresets,
    })
    
    return <img src={presetUrl} alt={media.alt || ''} />
  }

  // Fallback to default URL
  return <img src={media.url} alt={media.alt || ''} />
}

// Example: Building a transformation system with variants
interface MediaWithVariants extends typeof media {
  variants?: {
    name: string
    transformations: Record<string, any>
  }[]
}

export function createVariantUrls(media: MediaWithVariants) {
  const variants: Record<string, string> = {
    // Always include original
    original: media.url || '',
    // Always include thumbnail
    thumbnail: media.thumbnailURL || '',
  }

  // Add custom variants if defined
  if (media.variants) {
    media.variants.forEach(variant => {
      variants[variant.name] = getTransformationUrl({
        publicId: media.cloudinaryPublicId!,
        version: media.cloudinaryVersion || undefined,
        customTransformations: variant.transformations,
      })
    })
  }

  return variants
}

// Example: React component with dynamic transformations
interface ResponsiveImageProps {
  media: {
    cloudinaryPublicId: string
    cloudinaryVersion?: number
    alt?: string
  }
  sizes?: {
    mobile?: { width: number; height?: number }
    tablet?: { width: number; height?: number }
    desktop?: { width: number; height?: number }
  }
  className?: string
}

export function ResponsiveImage({ 
  media, 
  sizes = {
    mobile: { width: 640 },
    tablet: { width: 1024 },
    desktop: { width: 1920 },
  },
  className 
}: ResponsiveImageProps) {
  // Generate URLs for each size
  const urls = {
    mobile: sizes.mobile ? getTransformationUrl({
      publicId: media.cloudinaryPublicId,
      version: media.cloudinaryVersion,
      customTransformations: {
        width: sizes.mobile.width,
        height: sizes.mobile.height,
        crop: 'fill',
        quality: 'auto',
        fetch_format: 'auto',
      },
    }) : '',
    tablet: sizes.tablet ? getTransformationUrl({
      publicId: media.cloudinaryPublicId,
      version: media.cloudinaryVersion,
      customTransformations: {
        width: sizes.tablet.width,
        height: sizes.tablet.height,
        crop: 'fill',
        quality: 'auto',
        fetch_format: 'auto',
      },
    }) : '',
    desktop: sizes.desktop ? getTransformationUrl({
      publicId: media.cloudinaryPublicId,
      version: media.cloudinaryVersion,
      customTransformations: {
        width: sizes.desktop.width,
        height: sizes.desktop.height,
        crop: 'fill',
        quality: 'auto',
        fetch_format: 'auto',
      },
    }) : '',
  }

  return (
    <picture className={className}>
      {sizes.mobile && (
        <source
          media="(max-width: 640px)"
          srcSet={urls.mobile}
        />
      )}
      {sizes.tablet && (
        <source
          media="(max-width: 1024px)"
          srcSet={urls.tablet}
        />
      )}
      <img
        src={urls.desktop || urls.tablet || urls.mobile}
        alt={media.alt || ''}
        loading="lazy"
      />
    </picture>
  )
}

// Example: Using transformation based on user preferences or settings
export async function UserPreferenceExample({ userId }: { userId: string }) {
  const payload = await getPayload({ config })
  
  // Get user preferences (hypothetical)
  const userPreferences = {
    imageQuality: 'high', // 'low', 'medium', 'high'
    dataMode: 'standard', // 'saver', 'standard'
  }

  const media = await payload.findByID({
    collection: 'media',
    id: 'some-media-id',
  })

  // Build transformations based on preferences
  const qualityMap = {
    low: 'auto:eco',
    medium: 'auto:good',
    high: 'auto:best',
  }

  const transformations: Record<string, any> = {
    quality: qualityMap[userPreferences.imageQuality] || 'auto',
    fetch_format: 'auto',
  }

  if (userPreferences.dataMode === 'saver') {
    transformations.quality = 'auto:eco'
    transformations.dpr = '1.0' // Don't serve retina images
  }

  const optimizedUrl = getTransformationUrl({
    publicId: media.cloudinaryPublicId!,
    version: media.cloudinaryVersion,
    customTransformations: transformations,
  })

  return <img src={optimizedUrl} alt={media.alt || ''} />
}
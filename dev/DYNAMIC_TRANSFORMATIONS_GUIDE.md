# Dynamic Transformations Guide

This guide explains how to dynamically use transformations with the Cloudinary storage plugin.

## Understanding How Transformations Work

The plugin applies transformations at two different stages:

1. **Upload Time** - Default transformations from your config are applied when the file is uploaded
2. **Render Time** - Dynamic transformations can be applied when displaying images

## What Gets Stored in the Database

When you upload a file, these fields are stored:

```typescript
{
  // Core Cloudinary identifiers
  cloudinaryPublicId: string      // Unique ID in Cloudinary
  cloudinaryVersion: number       // Version for cache busting
  cloudinaryUrl: string          // Direct Cloudinary URL
  cloudinaryFolder: string       // Folder path in Cloudinary
  
  // URLs with transformations
  url: string                    // URL with default transformations applied
  thumbnailURL: string           // Always 150x150 for admin UI
  
  // If enablePresetSelection: true
  transformationPreset?: string  // Selected preset name
  
  // Standard Payload fields
  filename: string
  filesize: number
  width?: number
  height?: number
  alt?: string
}
```

## Using CMS-Configured Transformations

### 1. Default Transformations

If you configure default transformations in your plugin config:

```typescript
cloudinaryStorage({
  collections: {
    media: {
      transformations: {
        default: {
          quality: 'auto',
          fetch_format: 'auto',
          dpr: 'auto',
        }
      }
    }
  }
})
```

These are automatically applied to the `url` field:

```typescript
// This URL already has the default transformations
const optimizedUrl = media.url
```

### 2. Preset Selection

If you enable preset selection:

```typescript
cloudinaryStorage({
  collections: {
    media: {
      transformations: {
        presets: commonPresets,
        enablePresetSelection: true,
      }
    }
  }
})
```

Users can select a preset during upload, which is stored in the document:

```typescript
// Check if a preset was selected
if (media.transformationPreset) {
  const presetUrl = getTransformationUrl({
    publicId: media.cloudinaryPublicId,
    version: media.cloudinaryVersion,
    presetName: media.transformationPreset,
    presets: commonPresets,
  })
}
```

## Dynamic Transformations at Render Time

### Basic Example

```typescript
import { getTransformationUrl } from 'payload-storage-cloudinary'

// Apply transformations based on usage context
const heroImage = getTransformationUrl({
  publicId: media.cloudinaryPublicId,
  version: media.cloudinaryVersion,
  customTransformations: {
    width: 1920,
    height: 600,
    crop: 'fill',
    gravity: 'auto',
    quality: 'auto:best',
  }
})
```

### Context-Based Transformations

Create different transformations based on where the image is used:

```typescript
function getImageUrl(media: Media, context: 'hero' | 'thumbnail' | 'card') {
  const transformations = {
    hero: {
      width: 1920,
      height: 600,
      crop: 'fill',
      gravity: 'auto',
      quality: 'auto:best',
    },
    thumbnail: {
      width: 300,
      height: 300,
      crop: 'thumb',
      gravity: 'face',
      quality: 'auto',
    },
    card: {
      width: 400,
      height: 300,
      crop: 'fill',
      gravity: 'auto',
      quality: 'auto',
    },
  }

  return getTransformationUrl({
    publicId: media.cloudinaryPublicId,
    version: media.cloudinaryVersion,
    customTransformations: transformations[context],
  })
}
```

### Responsive Images

Generate multiple sizes for different screen sizes:

```tsx
function ResponsiveImage({ media }: { media: Media }) {
  const sizes = [640, 768, 1024, 1280, 1536, 1920]
  
  const srcSet = sizes
    .map(width => {
      const url = getTransformationUrl({
        publicId: media.cloudinaryPublicId,
        version: media.cloudinaryVersion,
        customTransformations: {
          width,
          quality: 'auto',
          fetch_format: 'auto',
        },
      })
      return `${url} ${width}w`
    })
    .join(', ')

  return (
    <img
      src={media.url}
      srcSet={srcSet}
      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
      alt={media.alt || ''}
    />
  )
}
```

### Art Direction with Picture Element

Different crops for different screen sizes:

```tsx
<picture>
  {/* Mobile - square crop */}
  <source
    media="(max-width: 640px)"
    srcSet={getTransformationUrl({
      publicId: media.cloudinaryPublicId,
      version: media.cloudinaryVersion,
      customTransformations: {
        width: 640,
        height: 640,
        crop: 'fill',
        gravity: 'auto',
      }
    })}
  />
  
  {/* Tablet - 4:3 crop */}
  <source
    media="(max-width: 1024px)"
    srcSet={getTransformationUrl({
      publicId: media.cloudinaryPublicId,
      version: media.cloudinaryVersion,
      customTransformations: {
        width: 1024,
        height: 768,
        crop: 'fill',
        gravity: 'auto',
      }
    })}
  />
  
  {/* Desktop - wide crop */}
  <img
    src={getTransformationUrl({
      publicId: media.cloudinaryPublicId,
      version: media.cloudinaryVersion,
      customTransformations: {
        width: 1920,
        height: 600,
        crop: 'fill',
        gravity: 'auto',
      }
    })}
    alt={media.alt || ''}
  />
</picture>
```

## Advanced Dynamic Transformations

### User Preference Based

```typescript
function getUserOptimizedUrl(media: Media, userPreferences: UserPrefs) {
  const transformations: any = {
    fetch_format: 'auto',
  }

  // Adjust quality based on user's data plan
  if (userPreferences.dataSaver) {
    transformations.quality = 'auto:eco'
    transformations.dpr = '1.0' // No retina images
  } else {
    transformations.quality = 'auto:best'
    transformations.dpr = 'auto'
  }

  // Adjust for user's connection speed
  if (userPreferences.connectionSpeed === 'slow') {
    transformations.quality = 30
    transformations.flags = 'progressive'
  }

  return getTransformationUrl({
    publicId: media.cloudinaryPublicId,
    version: media.cloudinaryVersion,
    customTransformations: transformations,
  })
}
```

### Device-Based Transformations

```typescript
function getDeviceOptimizedUrl(media: Media, device: DeviceInfo) {
  const transformations: any = {
    quality: 'auto',
    fetch_format: 'auto',
  }

  // Optimize for device capabilities
  if (device.pixelRatio > 1) {
    transformations.dpr = device.pixelRatio
  }

  if (device.supportsWebP) {
    transformations.format = 'webp'
  } else if (device.supportsAvif) {
    transformations.format = 'avif'
  }

  // Adjust size for viewport
  transformations.width = Math.min(device.viewportWidth, 1920)
  transformations.crop = 'limit'

  return getTransformationUrl({
    publicId: media.cloudinaryPublicId,
    version: media.cloudinaryVersion,
    customTransformations: transformations,
  })
}
```

### Lazy Loading with Progressive Enhancement

```tsx
function LazyImage({ media }: { media: Media }) {
  const [isInView, setIsInView] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true)
          observer.disconnect()
        }
      },
      { threshold: 0.1 }
    )

    if (imgRef.current) {
      observer.observe(imgRef.current)
    }

    return () => observer.disconnect()
  }, [])

  // Show low-quality placeholder initially
  const placeholderUrl = getTransformationUrl({
    publicId: media.cloudinaryPublicId,
    version: media.cloudinaryVersion,
    customTransformations: {
      width: 50,
      quality: 10,
      blur: 1000,
    },
  })

  // Load high-quality when in view
  const fullUrl = isInView ? media.url : placeholderUrl

  return (
    <img
      ref={imgRef}
      src={fullUrl}
      alt={media.alt || ''}
      loading="lazy"
      style={{
        filter: isInView ? 'none' : 'blur(20px)',
        transition: 'filter 0.3s',
      }}
    />
  )
}
```

## Best Practices

1. **Use the stored `url` field** when you want the default transformations
2. **Apply dynamic transformations** for specific contexts (hero, thumbnail, etc.)
3. **Cache transformation URLs** to avoid recalculating them
4. **Use responsive images** with srcset for better performance
5. **Consider user preferences** like data saver mode
6. **Implement lazy loading** for images below the fold
7. **Use format auto** to serve modern formats (WebP, AVIF) automatically

## Performance Tips

1. **Pre-generate common sizes** using eager transformations in your config
2. **Use Cloudinary's auto parameters** (quality, format, dpr) for optimization
3. **Implement blur-up placeholders** for perceived performance
4. **Use the CDN URL** returned by Cloudinary for best global performance
5. **Set appropriate cache headers** for transformed images
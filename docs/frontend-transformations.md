# Frontend Transformations Guide

This guide explains how to apply Cloudinary transformations on the frontend when displaying images.

## Understanding the Data Structure

When you upload a file through Payload with this plugin, the following fields are stored:

```typescript
{
  // Standard Payload fields
  id: '123',
  filename: 'product.jpg',
  mimeType: 'image/jpeg',
  filesize: 245000,
  width: 1920,
  height: 1080,
  alt: 'Product photo',
  
  // Cloudinary-specific fields
  url: 'https://res.cloudinary.com/your-cloud/image/upload/q_auto,f_auto/v1234567890/uploads/product.jpg',
  thumbnailURL: 'https://res.cloudinary.com/your-cloud/image/upload/w_150,h_150,c_fill/v1234567890/uploads/product.jpg',
  cloudinaryPublicId: 'uploads/product',
  cloudinaryVersion: 1234567890,
  cloudinaryResourceType: 'image',
  cloudinaryFormat: 'jpg',
  cloudinaryFolder: 'uploads',
  transformationPreset: 'card', // If preset selection is enabled
}
```

## Why You Get the Thumbnail

The `thumbnailURL` is specifically generated for the Payload admin UI to show small previews. The `url` field contains whatever default transformations you configured (or the original if no defaults were set).

## Applying Different Transformations

### Method 1: URL String Manipulation (Simplest)

Cloudinary URLs follow this pattern:
```
https://res.cloudinary.com/[cloud-name]/[resource-type]/upload/[transformations]/[version]/[public-id].[format]
```

You can modify the transformation part:

```typescript
function applyTransformation(url: string, transformations: string): string {
  // Remove existing transformations and add new ones
  const regex = /\/upload\/([^\/]*)\//
  return url.replace(regex, `/upload/${transformations}/`)
}

// Examples
const heroImage = applyTransformation(doc.url, 'w_1920,h_600,c_fill,q_auto,f_auto')
const thumbnail = applyTransformation(doc.url, 'w_300,h_300,c_thumb,g_face')
const blurred = applyTransformation(doc.url, 'w_400,e_blur:1000,q_auto')
```

### Method 2: Using the Plugin's Helper

```typescript
import { getTransformationUrl, commonPresets } from 'payload-storage-cloudinary'

// The helper needs the publicId and version from your document
const url = getTransformationUrl({
  publicId: doc.cloudinaryPublicId,
  version: doc.cloudinaryVersion,
  customTransformations: {
    width: 800,
    height: 600,
    crop: 'fill',
    gravity: 'auto',
    quality: 'auto',
    fetch_format: 'auto'
  }
})
```

### Method 3: Cloudinary SDK (If you need advanced features)

```typescript
import { Cloudinary } from '@cloudinary/url-gen'
import { fill } from '@cloudinary/url-gen/actions/resize'
import { autoGravity } from '@cloudinary/url-gen/qualifiers/gravity'

const cld = new Cloudinary({
  cloud: { cloudName: 'your-cloud-name' }
})

const image = cld.image(doc.cloudinaryPublicId)
  .resize(fill().width(800).height(600).gravity(autoGravity()))
  .quality('auto')
  .format('auto')

const url = image.toURL()
```

## Common Use Cases

### Responsive Images

```tsx
function ResponsiveImage({ doc }: { doc: any }) {
  // Generate multiple sizes
  const sizes = [
    { width: 320, media: '(max-width: 640px)' },
    { width: 640, media: '(max-width: 1024px)' },
    { width: 1024, media: '(max-width: 1920px)' },
    { width: 1920, media: '(min-width: 1921px)' }
  ]
  
  return (
    <picture>
      {sizes.map(({ width, media }) => (
        <source
          key={width}
          media={media}
          srcSet={applyTransformation(doc.url, `w_${width},q_auto,f_auto`)}
        />
      ))}
      <img src={doc.url} alt={doc.alt} />
    </picture>
  )
}
```

### Progressive Loading with Blur

```tsx
function ProgressiveImage({ doc }: { doc: any }) {
  const [loaded, setLoaded] = useState(false)
  
  const placeholder = applyTransformation(doc.url, 'w_50,e_blur:1000,q_1')
  const full = applyTransformation(doc.url, 'w_1200,q_auto,f_auto')
  
  return (
    <div className="relative">
      <img 
        src={placeholder}
        className={`absolute inset-0 w-full h-full ${loaded ? 'opacity-0' : 'opacity-100'}`}
        alt=""
      />
      <img 
        src={full}
        onLoad={() => setLoaded(true)}
        className={loaded ? 'opacity-100' : 'opacity-0'}
        alt={doc.alt}
      />
    </div>
  )
}
```

### Art Direction for Different Breakpoints

```tsx
function ArtDirectedImage({ doc }: { doc: any }) {
  return (
    <picture>
      {/* Mobile: Square crop focusing on faces */}
      <source
        media="(max-width: 640px)"
        srcSet={applyTransformation(doc.url, 'w_640,h_640,c_fill,g_face,q_auto,f_auto')}
      />
      
      {/* Tablet: 4:3 ratio */}
      <source
        media="(max-width: 1024px)"
        srcSet={applyTransformation(doc.url, 'w_1024,h_768,c_fill,g_auto,q_auto,f_auto')}
      />
      
      {/* Desktop: 16:9 ratio */}
      <img 
        src={applyTransformation(doc.url, 'w_1920,h_1080,c_fill,g_auto,q_auto,f_auto')}
        alt={doc.alt}
      />
    </picture>
  )
}
```

## Transformation Parameters

Common Cloudinary transformation parameters:

- **w** (width): Pixel width or 'auto'
- **h** (height): Pixel height or 'auto' 
- **c** (crop): fill, fit, scale, pad, thumb, crop
- **g** (gravity): auto, face, faces, center, north, south, etc.
- **q** (quality): auto, auto:best, auto:good, auto:eco, auto:low, 0-100
- **f** (format): auto, webp, avif, jpg, png
- **e** (effect): blur, grayscale, sepia, brightness, etc.
- **r** (radius): Rounded corners (pixels or 'max')
- **dpr** (device pixel ratio): auto, 1.0, 2.0, 3.0

## Performance Tips

1. **Use f_auto and q_auto**: Let Cloudinary optimize format and quality
2. **Implement lazy loading**: Load images as they enter the viewport
3. **Use responsive images**: Serve appropriately sized images for each device
4. **Cache transformation URLs**: Store generated URLs to avoid recalculation
5. **Use named transformations**: Create reusable transformations in Cloudinary console

## Next.js Image Component

```tsx
import Image from 'next/image'

function NextImage({ doc }: { doc: any }) {
  // Next.js Image component with Cloudinary loader
  const cloudinaryLoader = ({ src, width, quality }: any) => {
    const params = ['f_auto', 'c_limit', `w_${width}`, `q_${quality || 'auto'}`]
    return `https://res.cloudinary.com/your-cloud-name/image/upload/${params.join(',')}/${src}`
  }
  
  return (
    <Image
      loader={cloudinaryLoader}
      src={`v${doc.cloudinaryVersion}/${doc.cloudinaryPublicId}`}
      alt={doc.alt}
      width={doc.width}
      height={doc.height}
      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
    />
  )
}
```

## Debugging Tips

1. Check the stored `cloudinaryPublicId` and `cloudinaryVersion` values
2. Verify transformation syntax in Cloudinary's documentation
3. Use browser DevTools to inspect the final URLs being loaded
4. Test transformations in Cloudinary's Media Library first
5. Check for URL encoding issues with special characters
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
  url: 'https://res.cloudinary.com/your-cloud/image/upload/v1234567890/uploads/product.jpg', // Original URL (when preserveOriginal: true)
  originalUrl: 'https://res.cloudinary.com/your-cloud/image/upload/v1234567890/uploads/product.jpg', // Always the original
  transformedUrl: 'https://res.cloudinary.com/your-cloud/image/upload/w_800,h_600,c_fill/v1234567890/uploads/product.jpg', // With selected presets (if any)
  thumbnailURL: 'https://res.cloudinary.com/your-cloud/image/upload/w_150,h_150,c_fill/v1234567890/uploads/product.jpg', // Admin UI thumbnail
  cloudinaryPublicId: 'uploads/product',
  cloudinaryVersion: 1234567890,
  cloudinaryResourceType: 'image',
  cloudinaryFormat: 'jpg',
  cloudinaryFolder: 'uploads',
  transformationPreset: ['card', 'grayscale'], // Array of selected presets (if multi-select enabled)
  
  // Private file fields (if enabled)
  isPrivate: false,
  requiresSignedURL: false,
  previewUrl: 'https://res.cloudinary.com/your-cloud/image/authenticated/s--...--/w_800,h_600,c_fill/.../l_text:...', // Private file only: signed presets + watermark/blur
}
```

## Understanding URL Fields

> **Private files:** on a collection with `privateFiles`, these URLs are built when the document is read, from the reader's access, and none of them is stored. A private file never returns `originalUrl` or `cloudinaryUrl`, and a reader without access to the original gets `null` in `url`, `thumbnailURL` and `transformedUrl`. See [URL fields of a private file](../README.md#url-fields-of-a-private-file).

### When `preserveOriginal: true` (Recommended)
- **`url`**: Always contains the original URL
- **`originalUrl`**: Same as `url` - the untransformed image
- **`transformedUrl`**: Contains URL with selected transformation presets applied (only when presets are selected)
- **`thumbnailURL`**: 150x150 thumbnail for admin UI

### When `preserveOriginal: false`
- **`url`**: Contains the image with default transformations applied during upload
- **`originalUrl`**: The original untransformed URL
- **`transformedUrl`**: Not used in this mode

## Choosing the Right URL

```tsx
function ProductImage({ doc }: { doc: any }) {
  // Use transformedUrl if available (user selected presets), otherwise use url
  const imageUrl = doc.transformedUrl || doc.url
  
  return (
    <img 
      src={imageUrl} 
      alt={doc.alt}
      width={doc.width}
      height={doc.height}
    />
  )
}
```

## Applying Custom Transformations

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
const heroImage = applyTransformation(doc.originalUrl, 'w_1920,h_600,c_fill,q_auto,f_auto')
const thumbnail = applyTransformation(doc.originalUrl, 'w_300,h_300,c_thumb,g_face')
const blurred = applyTransformation(doc.originalUrl, 'w_400,e_blur:1000,q_auto')
```

### Method 2: Using the Plugin's Helper

```typescript
import { getTransformationUrl, commonPresets } from 'payload-storage-cloudinary'

// Use original URL as base
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

// Or use a preset
const thumbnailUrl = getTransformationUrl({
  publicId: doc.cloudinaryPublicId,
  version: doc.cloudinaryVersion,
  presetName: 'thumbnail',
  presets: commonPresets,
})
```

### Method 3: Combining User Presets with Custom Transformations

```typescript
import { getTransformationUrl, commonPresets } from 'payload-storage-cloudinary'

function getCustomUrl(doc: any) {
  // If user selected presets, apply them first
  if (doc.transformationPreset?.length > 0) {
    // Start with the transformed URL that already has presets applied
    return applyTransformation(doc.transformedUrl, 'w_800,h_600,c_fill')
  }
  
  // Otherwise, apply transformations to original
  return applyTransformation(doc.originalUrl, 'w_800,h_600,c_fill,q_auto,f_auto')
}
```

## Working with Multi-Select Presets

When `hasMany: true` is enabled for transformation presets, users can select multiple presets:

```typescript
// User selected: ["grayscale", "card"]
// transformedUrl contains: .../w_400,h_400,c_fill,e_grayscale/...

function ImageWithPresets({ doc }: { doc: any }) {
  if (doc.transformationPreset?.length > 0) {
    // User selected presets - use the pre-computed transformedUrl
    return <img src={doc.transformedUrl} alt={doc.alt} />
  }
  
  // No presets selected - use original
  return <img src={doc.url} alt={doc.alt} />
}
```

## Common Use Cases

### Responsive Images

```tsx
function ResponsiveImage({ doc }: { doc: any }) {
  // Use the best available URL as base
  const baseUrl = doc.transformedUrl || doc.originalUrl
  
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
          srcSet={applyTransformation(baseUrl, `w_${width},q_auto,f_auto`)}
        />
      ))}
      <img src={baseUrl} alt={doc.alt} />
    </picture>
  )
}
```

### Progressive Loading with Blur

```tsx
function ProgressiveImage({ doc }: { doc: any }) {
  const [loaded, setLoaded] = useState(false)
  
  const baseUrl = doc.transformedUrl || doc.originalUrl
  const placeholder = applyTransformation(baseUrl, 'w_50,e_blur:1000,q_1')
  const full = applyTransformation(baseUrl, 'w_1200,q_auto,f_auto')
  
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
  const baseUrl = doc.transformedUrl || doc.originalUrl
  
  return (
    <picture>
      {/* Mobile: Square crop focusing on faces */}
      <source
        media="(max-width: 640px)"
        srcSet={applyTransformation(baseUrl, 'w_640,h_640,c_fill,g_face,q_auto,f_auto')}
      />
      
      {/* Tablet: 4:3 ratio */}
      <source
        media="(max-width: 1024px)"
        srcSet={applyTransformation(baseUrl, 'w_1024,h_768,c_fill,g_auto,q_auto,f_auto')}
      />
      
      {/* Desktop: 16:9 ratio */}
      <img 
        src={applyTransformation(baseUrl, 'w_1920,h_1080,c_fill,g_auto,q_auto,f_auto')}
        alt={doc.alt}
      />
    </picture>
  )
}
```

## Private Files and Previews

### Basic Private File Handling

```tsx
import { useSignedURL } from 'payload-storage-cloudinary/client'
import React from 'react'

function PrivateImage({ doc }: { doc: any }) {
  const { url, loading, error } = useSignedURL('media', doc?.id, {
    react: React // Required in Next.js
  })
  
  if (loading) return <div>Loading...</div>
  if (error) return <div>Error loading image</div>
  
  return url ? <img src={url} alt={doc.alt} /> : null
}
```

### Using Previews

A reader who may only see the preview of a private file gets `previewUrl`, and `null` in `url`, `thumbnailURL` and `transformedUrl`. `previewUrl` carries the selected presets, then the watermark or blur, and is signed for an `authenticated` original. A file uploaded before 1.3.0 gets an unsigned preview until it is [migrated](./public-transformation-example.md#files-uploaded-before-130). See [Previews for Private Files](./public-transformation-example.md).

```tsx
function ImageWithPreview({ doc }: { doc: any }) {
  if (doc.transformedUrl || doc.url) {
    // A public file, or a reader who may get the original
    return <img src={doc.transformedUrl || doc.url} alt={doc.alt} />
  }
  
  // A reader who may only see the preview
  if (doc.previewUrl) {
    return (
      <div>
        <img src={doc.previewUrl} alt={`${doc.alt} (preview)`} />
        <p>This is a preview. <a href="/login">Log in</a> to see full quality.</p>
      </div>
    )
  }
  
  // No preview, so require authentication
  return <div>This image requires authentication</div>
}
```

Don't splice transformations into `previewUrl`. The signature covers them, so Cloudinary answers 401 to an edited URL.

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
4. **Prefer transformedUrl**: When users select presets, use the pre-computed URL
5. **Cache transformation URLs**: Store generated URLs to avoid recalculation
6. **Use `preserveOriginal: true`**: Allows flexible transformations without re-uploading

## Next.js Image Component

```tsx
import Image from 'next/image'

function NextImage({ doc }: { doc: any }) {
  // Use the best available URL as base
  const baseUrl = doc.transformedUrl || doc.originalUrl
  
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

## Best Practices

1. **Always use the appropriate URL**:
   - `transformedUrl` for images with user-selected presets
   - `originalUrl` for custom transformations
   - `previewUrl` for previews of private files

2. **Combine transformations wisely**:
   - Apply additional transformations to `transformedUrl` to build on user selections
   - Use `originalUrl` when you need complete control

3. **Handle private files properly**:
   - Use the provided hooks for authenticated content
   - Show `previewUrl` when the reader has no `url`
   - Provide clear authentication prompts

4. **Performance considerations**:
   - Use `preserveOriginal: true` for maximum flexibility
   - Cache generated URLs
   - Implement progressive loading for better UX

## Debugging Tips

1. Check the stored URL fields in your document
2. Verify transformation syntax in Cloudinary's documentation
3. Use browser DevTools to inspect the final URLs being loaded
4. Test transformations in Cloudinary's Media Library first
5. Check for URL encoding issues with special characters
6. Use `console.log()` to inspect the document structure and available URLs
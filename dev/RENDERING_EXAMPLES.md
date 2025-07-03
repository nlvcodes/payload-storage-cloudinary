# Cloudinary Image Rendering Examples

This guide shows various ways to render transformed images from Cloudinary in your Next.js application.

## Basic Usage

### 1. Using the Helper Function

```typescript
import { getTransformationUrl, commonPresets } from 'payload-storage-cloudinary'

// Using a preset
const thumbnailUrl = getTransformationUrl({
  publicId: media.cloudinaryPublicId,
  version: media.cloudinaryVersion,
  presetName: 'thumbnail', // 150x150 by default
  presets: commonPresets,
})

// Custom transformation
const heroImageUrl = getTransformationUrl({
  publicId: media.cloudinaryPublicId,
  version: media.cloudinaryVersion,
  customTransformations: {
    width: 1920,
    height: 600,
    crop: 'fill',
    gravity: 'auto',
    quality: 'auto:best',
    fetch_format: 'auto',
  },
})
```

### 2. Direct URL Manipulation

```typescript
// Simple approach - just replace the upload segment
const transformedUrl = media.url.replace(
  '/upload/',
  '/upload/w_800,h_600,c_fill,q_auto,f_auto/'
)
```

## Component Examples

### Basic Image Component

```tsx
import { CloudinaryImage } from './components/CloudinaryImage'

// Using presets
<CloudinaryImage 
  media={mediaItem}
  transformation="thumbnail"
/>

// Custom transformation
<CloudinaryImage 
  media={mediaItem}
  transformation="custom"
  customTransformations={{
    width: 400,
    height: 300,
    crop: 'fill',
    radius: 20,
    effect: 'sharpen',
  }}
/>
```

### Responsive Images

```tsx
import { ResponsiveCloudinaryImage } from './components/CloudinaryImage'

<ResponsiveCloudinaryImage 
  media={mediaItem}
  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
/>
```

### Background Images

```tsx
import { CloudinaryBackgroundImage } from './components/CloudinaryImage'

<CloudinaryBackgroundImage 
  media={mediaItem}
  height="500px"
  overlayColor="rgba(0, 0, 0, 0.5)"
>
  <div style={{ padding: '2rem', color: 'white' }}>
    <h1>Hero Section</h1>
    <p>Content over the background image</p>
  </div>
</CloudinaryBackgroundImage>
```

## Common Transformations

### E-commerce Product Images

```typescript
// Product thumbnail
const thumbnail = getTransformationUrl({
  publicId: product.image.cloudinaryPublicId,
  version: product.image.cloudinaryVersion,
  customTransformations: {
    width: 300,
    height: 300,
    crop: 'fill',
    gravity: 'auto',
    quality: 'auto',
    fetch_format: 'auto',
  },
})

// Product detail image
const detailImage = getTransformationUrl({
  publicId: product.image.cloudinaryPublicId,
  version: product.image.cloudinaryVersion,
  customTransformations: {
    width: 800,
    quality: 'auto:best',
    fetch_format: 'auto',
    zoom: 2, // Allow zooming
  },
})
```

### Blog/Article Images

```typescript
// Hero banner
const heroBanner = getTransformationUrl({
  publicId: article.featuredImage.cloudinaryPublicId,
  version: article.featuredImage.cloudinaryVersion,
  customTransformations: {
    width: 1200,
    height: 630, // Open Graph dimensions
    crop: 'fill',
    gravity: 'auto',
    quality: 'auto',
    fetch_format: 'auto',
    // Add text overlay
    overlay: 'text:Arial_60_bold:' + encodeURIComponent(article.title),
    color: 'white',
    gravity: 'south',
    y: 50,
  },
})

// Inline article image
const inlineImage = getTransformationUrl({
  publicId: image.cloudinaryPublicId,
  version: image.cloudinaryVersion,
  customTransformations: {
    width: 800,
    quality: 'auto',
    fetch_format: 'auto',
    // Add slight sharpening for text readability
    effect: 'sharpen:50',
  },
})
```

### User Avatars

```typescript
// Round avatar
const avatar = getTransformationUrl({
  publicId: user.avatar.cloudinaryPublicId,
  version: user.avatar.cloudinaryVersion,
  customTransformations: {
    width: 100,
    height: 100,
    crop: 'fill',
    gravity: 'face', // Focus on face
    radius: 'max', // Make it circular
    quality: 'auto',
    fetch_format: 'auto',
  },
})
```

## Performance Tips

1. **Use `fetch_format: 'auto'`** - Automatically serves WebP/AVIF to supported browsers
2. **Use `quality: 'auto'`** - Balances quality and file size
3. **Use `dpr: 'auto'`** - Serves high-DPI images to retina displays
4. **Implement lazy loading** - Add `loading="lazy"` to images below the fold
5. **Use responsive images** - Provide multiple sizes with srcset

## SEO Considerations

```tsx
// Always include alt text
<img 
  src={transformedUrl}
  alt={media.alt || media.filename}
  width={media.width}
  height={media.height}
/>

// For Open Graph images
<meta property="og:image" content={
  getTransformationUrl({
    publicId: media.cloudinaryPublicId,
    version: media.cloudinaryVersion,
    customTransformations: {
      width: 1200,
      height: 630,
      crop: 'fill',
      quality: 'auto:best',
    },
  })
} />
```

## Available Transformations

Common parameters you can use:
- `width`, `height` - Dimensions
- `crop` - 'fill', 'fit', 'limit', 'scale', 'thumb'
- `gravity` - 'auto', 'face', 'faces', 'center', 'north', 'south', etc.
- `quality` - 1-100 or 'auto', 'auto:best', 'auto:eco', 'auto:good'
- `format` - 'auto', 'webp', 'avif', 'jpg', 'png'
- `effect` - 'grayscale', 'sepia', 'blur:300', 'sharpen', etc.
- `radius` - Border radius in pixels or 'max' for circular
- `angle` - Rotation in degrees
- `opacity` - 0-100
- `overlay` - Text or image overlays
- `background` - Background color for transparent images

See Cloudinary's documentation for the full list of transformations.
# Cloudinary Transformations

The `transformations` option allows you to apply automatic transformations to all uploads in a collection. These transformations are applied during upload and become part of the base image stored in Cloudinary.

## Basic Usage

```typescript
cloudinaryStorage({
  collections: {
    media: {
      transformations: {
        quality: 'auto',
        fetch_format: 'auto',
      },
    },
  },
})
```

## Common Transformation Options

### Image Quality & Format
```typescript
transformations: {
  quality: 'auto',        // Automatically optimize quality
  quality: 80,            // Fixed quality (1-100)
  fetch_format: 'auto',   // Auto-convert to best format (WebP, AVIF, etc.)
  format: 'webp',         // Force specific format
}
```

### Resizing & Cropping
```typescript
transformations: {
  width: 1920,            // Max width
  height: 1080,           // Max height
  crop: 'limit',          // Resize only if larger
  crop: 'fill',           // Crop to exact size
  crop: 'fit',            // Fit within dimensions
  gravity: 'auto',        // Smart cropping focus
  gravity: 'center',      // Center crop
  gravity: 'face',        // Focus on faces
}
```

### Effects & Filters
```typescript
transformations: {
  effect: 'blur:300',     // Blur effect
  effect: 'grayscale',    // Convert to grayscale
  effect: 'sepia',        // Sepia tone
  angle: 90,              // Rotate
  background: 'white',    // Background color for transparent images
}
```

### Advanced Options
```typescript
transformations: {
  dpr: 'auto',            // Device pixel ratio
  flags: 'progressive',   // Progressive loading
  flags: 'immutable_cache', // Long-term caching
  overlay: 'logo_watermark', // Add watermark
  opacity: 80,            // Transparency
}
```

## Complete Examples

### Optimized Web Images
```typescript
transformations: {
  quality: 'auto:best',
  fetch_format: 'auto',
  width: 2048,
  crop: 'limit',
  flags: ['progressive', 'immutable_cache'],
  dpr: 'auto',
}
```

### Thumbnail Generation
```typescript
transformations: {
  width: 300,
  height: 300,
  crop: 'fill',
  gravity: 'auto',
  quality: 'auto',
  fetch_format: 'auto',
}
```

### Social Media Images
```typescript
transformations: {
  width: 1200,
  height: 630,
  crop: 'fill',
  quality: 'auto:good',
  fetch_format: 'jpg',
  effect: 'improve',
}
```

### Protected/Blurred Previews
```typescript
transformations: {
  effect: 'blur:1000',
  quality: 30,
  width: 400,
}
```

## Dynamic Transformations

While the `transformations` option applies during upload, you can also apply transformations when displaying images:

```typescript
// Using transformation presets
import { getTransformationUrl } from 'payload-storage-cloudinary'

const thumbnailUrl = getTransformationUrl({
  publicId: doc.cloudinaryPublicId,
  version: doc.cloudinaryVersion,
  transformation: {
    width: 150,
    height: 150,
    crop: 'thumb',
  },
})
```

## Important Notes

1. **Upload-time vs Display-time**: The `transformations` option applies transformations during upload, making them permanent. For dynamic transformations, use transformation presets or URL manipulation.

2. **Performance**: Upload-time transformations may slow down the upload process. Consider using display-time transformations for better upload performance.

3. **Storage**: Upload-time transformations create a new version of the image. The original is not kept unless you configure Cloudinary to do so.

4. **Chaining**: Multiple transformations are applied in order. Be mindful of the sequence.

## References

For a complete list of transformation options, see the [Cloudinary Transformation Reference](https://cloudinary.com/documentation/transformation_reference).
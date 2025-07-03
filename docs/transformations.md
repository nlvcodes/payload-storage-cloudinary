# Transformations & Presets

Apply automatic image transformations and use predefined transformation presets.

## Overview

The plugin supports two ways to apply transformations:
1. **Default transformations** - Applied to all uploads automatically
2. **Transformation presets** - Predefined sets that users can select

## Default Transformations

Apply transformations to all uploads in a collection:

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

### Common Options

#### Image Quality & Format
```typescript
transformations: {
  quality: 'auto',        // Automatically optimize quality
  quality: 80,            // Fixed quality (1-100)
  fetch_format: 'auto',   // Auto-convert to best format (WebP, AVIF)
  format: 'webp',         // Force specific format
}
```

#### Resizing & Cropping
```typescript
transformations: {
  width: 1920,            // Max width
  height: 1080,           // Max height
  crop: 'limit',          // Resize only if larger
  crop: 'fill',           // Crop to exact size
  crop: 'fit',            // Fit within dimensions
  gravity: 'auto',        // Smart cropping focus
  gravity: 'face',        // Focus on faces
}
```

#### Effects & Filters
```typescript
transformations: {
  effect: 'blur:300',     // Blur effect
  effect: 'grayscale',    // Convert to grayscale
  effect: 'sharpen',      // Sharpen image
  radius: 20,             // Rounded corners
  radius: 'max',          // Circular crop
  angle: 90,              // Rotation
}
```

## Transformation Presets

Allow users to select from predefined transformation sets:

```typescript
import { cloudinaryStorage, commonPresets } from 'payload-storage-cloudinary'

cloudinaryStorage({
  collections: {
    media: {
      transformations: {
        presets: commonPresets,
        enablePresetSelection: true,
      },
    },
  },
})
```

### Built-in Common Presets

The plugin includes these presets:
- **thumbnail**: 150x150 thumb crop
- **card**: 400x400 fill crop
- **banner**: 1200x600 fill crop
- **og-image**: 1200x630 Open Graph size
- **avatar**: 200x200 circular crop focused on faces
- **blur**: Blurred preview image

### Custom Presets

Define your own transformation presets:

```typescript
const myPresets = {
  ...commonPresets, // Include built-in presets
  
  // Add custom presets
  productThumb: {
    width: 300,
    height: 300,
    crop: 'fill',
    gravity: 'auto',
    quality: 'auto:best',
  },
  productHero: {
    width: 1920,
    height: 800,
    crop: 'fill',
    gravity: 'auto',
    quality: 'auto:best',
  },
}

// Use in configuration
transformations: {
  presets: myPresets,
  enablePresetSelection: true,
}
```

### Using Selected Presets

When preset selection is enabled, users can choose a preset during upload. The selection is stored in the `transformationPreset` field:

```typescript
// In your frontend
import { getTransformationUrl, commonPresets } from 'payload-storage-cloudinary'

const imageUrl = media.transformationPreset
  ? getTransformationUrl({
      publicId: media.cloudinaryPublicId,
      version: media.cloudinaryVersion,
      presetName: media.transformationPreset,
      presets: commonPresets,
    })
  : media.url
```

## Advanced Configuration

### Organized Transformation Config

```typescript
transformations: {
  // Default transformations for all uploads
  default: {
    quality: 'auto',
    fetch_format: 'auto',
  },
  
  // Available presets
  presets: {
    thumbnail: { width: 150, height: 150, crop: 'thumb' },
    hero: { width: 1920, height: 600, crop: 'fill' },
  },
  
  // Enable preset selection UI
  enablePresetSelection: true,
  
  // Preserve original without transformations
  preserveOriginal: true,
}
```

### Shorthand Configuration

For simple default transformations:

```typescript
// This shorthand...
transformations: {
  width: 800,
  quality: 'auto',
}

// Is equivalent to:
transformations: {
  default: {
    width: 800,
    quality: 'auto',
  },
}
```

## Important Notes

1. **URL Field**: The `url` field contains default transformations
2. **Thumbnail URL**: Always 150x150 for admin UI display
3. **Frontend Control**: Use helper functions to apply different transformations
4. **Performance**: Default transformations happen during upload
5. **Storage**: Transformations affect stored file size

## Examples

### E-commerce Product Images

```typescript
transformations: {
  default: {
    quality: 'auto:best',
    fetch_format: 'auto',
  },
  presets: {
    listing: { width: 400, height: 400, crop: 'fill' },
    detail: { width: 1200, quality: 'auto:best' },
    zoom: { width: 2400, quality: 100 },
  },
  enablePresetSelection: true,
}
```

### Blog Images

```typescript
transformations: {
  default: {
    width: 1200,
    quality: 'auto',
    fetch_format: 'auto',
  },
  presets: {
    thumbnail: { width: 300, height: 200, crop: 'fill' },
    featured: { width: 1920, height: 600, crop: 'fill' },
  },
}
```

### User Avatars

```typescript
transformations: {
  default: {
    width: 500,
    height: 500,
    crop: 'fill',
    gravity: 'face',
    quality: 'auto',
  },
  presets: {
    small: { width: 50, height: 50, radius: 'max' },
    medium: { width: 100, height: 100, radius: 'max' },
    large: { width: 200, height: 200, radius: 'max' },
  },
}
```

## See Also

- [Frontend Transformations Guide](./frontend-transformations.md) - Apply transformations on the frontend
- [Cloudinary Transformation Reference](https://cloudinary.com/documentation/transformation_reference)
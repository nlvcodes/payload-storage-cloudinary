# Transformations & Presets

Apply automatic image transformations and use predefined transformation presets with full control over when and how transformations are applied.

## Overview

The plugin supports multiple transformation approaches:
1. **Default transformations** - Applied to all uploads automatically
2. **Transformation presets** - Predefined sets that users can select (supports multi-select)
3. **Preserve original** - Keep untransformed originals with URL-based transformations
4. **Public transformations** - Watermarked/blurred previews for private files

## New Configuration Structure

The transformation system has been reorganized for better control:

```typescript
cloudinaryStorage({
  collections: {
    media: {
      transformations: {
        // Default transformations applied to all uploads
        default: {
          quality: 'auto',
          fetch_format: 'auto',
        },
        
        // Predefined transformation presets
        presets: [
          {
            name: 'card',
            label: 'Card View',
            transformation: {
              width: 400,
              height: 400,
              crop: 'fill',
              gravity: 'auto',
            },
          },
          {
            name: 'hero',
            label: 'Hero Image',
            transformation: {
              width: 1920,
              height: 600,
              crop: 'fill',
              gravity: 'auto',
            },
          },
        ],
        
        // Enable preset selection (supports multi-select)
        enablePresetSelection: true,
        
        // Preserve original without transformations (recommended)
        preserveOriginal: true,
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

## Understanding URL Fields

The plugin now creates different URL fields based on your configuration:

> **Private files:** on a collection with `privateFiles`, these URLs are built when the document is read, from the reader's access, and none of them is stored. A private file never returns `originalUrl`. See [URL fields of a private file](../README.md#url-fields-of-a-private-file).

### With `preserveOriginal: true` (Recommended)
- **`url`**: Always contains the original, untransformed URL
- **`originalUrl`**: Same as `url` - the original file
- **`transformedUrl`**: Contains URL with selected transformation presets applied
- **`thumbnailURL`**: 150x150 thumbnail for admin UI

### With `preserveOriginal: false`
- **`url`**: Contains the image with default transformations applied
- **`originalUrl`**: The original untransformed URL
- **`transformedUrl`**: Not used in this mode

## Multi-Select Transformation Presets

The plugin now supports selecting multiple transformation presets simultaneously:

```typescript
transformations: {
  presets: [
    {
      name: 'grayscale',
      label: 'Grayscale',
      transformation: {
        effect: 'grayscale',
      },
    },
    {
      name: 'card',
      label: 'Card Size',
      transformation: {
        width: 400,
        height: 400,
        crop: 'fill',
      },
    },
  ],
  enablePresetSelection: true, // This now enables multi-select by default
}
```

### How Multi-Select Works

1. Users can select multiple presets (e.g., "Grayscale" + "Card Size")
2. Transformations are combined automatically
3. The `transformedUrl` field contains the combined transformations
4. All transformations are applied via URL parameters (no re-upload)

### Frontend Usage

```typescript
// The transformationPreset field now contains an array
document.transformationPreset = ['grayscale', 'card']

// Use the pre-computed transformedUrl
const imageUrl = document.transformedUrl || document.url
```

## Built-in Preset Examples

Common preset configurations you can use:

```typescript
const commonPresets = [
  {
    name: 'thumbnail',
    label: 'Thumbnail',
    transformation: {
      width: 150,
      height: 150,
      crop: 'thumb',
      gravity: 'auto',
    },
  },
  {
    name: 'card',
    label: 'Card View',
    transformation: {
      width: 400,
      height: 400,
      crop: 'fill',
      gravity: 'auto',
    },
  },
  {
    name: 'hero',
    label: 'Hero Image',
    transformation: {
      width: 1920,
      height: 600,
      crop: 'fill',
      gravity: 'auto',
    },
  },
  {
    name: 'grayscale',
    label: 'Grayscale',
    transformation: {
      effect: 'grayscale',
    },
  },
]
```

## Advanced Configuration

### Complete Configuration Example

```typescript
transformations: {
  // Default transformations applied to all uploads
  default: {
    quality: 'auto',
    fetch_format: 'auto',
  },
  
  // Predefined transformation presets
  presets: [
    {
      name: 'thumbnail',
      label: 'Thumbnail',
      transformation: {
        width: 150,
        height: 150,
        crop: 'thumb',
        gravity: 'auto',
      },
    },
    {
      name: 'card',
      label: 'Card View',
      transformation: {
        width: 400,
        height: 400,
        crop: 'fill',
        gravity: 'auto',
      },
    },
  ],
  
  // Enable preset selection UI (supports multi-select)
  enablePresetSelection: true,
  
  // Custom field name for presets
  presetFieldName: 'transformationPreset',
  
  // Preserve original without transformations (recommended)
  preserveOriginal: true,
  
  // Public previews for private files
  publicTransformation: {
    enabled: true,
    watermark: {
      defaultText: 'PREVIEW',
      style: {
        fontFamily: 'Arial',
        fontSize: 50,
        color: 'rgb:808080',
        opacity: 50,
        angle: -45,
      },
    },
    blur: {
      effect: 'blur:2000',
      quality: 30,
    },
  },
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

1. **URL Fields**: Multiple URL fields are created based on your configuration
2. **Multi-Select**: Users can select multiple presets that get combined automatically
3. **No Re-uploads**: Changing presets doesn't trigger new uploads
4. **URL-based**: All transformations are applied via URL parameters when `preserveOriginal: true`
5. **Performance**: With `preserveOriginal: true`, transformation happens on-demand

## Complete Examples

### E-commerce Product Images

```typescript
transformations: {
  default: {
    quality: 'auto:best',
    fetch_format: 'auto',
  },
  presets: [
    {
      name: 'listing',
      label: 'Product Listing',
      transformation: {
        width: 400,
        height: 400,
        crop: 'fill',
        gravity: 'auto',
      },
    },
    {
      name: 'detail',
      label: 'Product Detail',
      transformation: {
        width: 1200,
        quality: 'auto:best',
      },
    },
    {
      name: 'zoom',
      label: 'Zoom View',
      transformation: {
        width: 2400,
        quality: 100,
      },
    },
  ],
  enablePresetSelection: true,
  preserveOriginal: true,
}
```

### Blog Images with Multi-Select

```typescript
transformations: {
  default: {
    quality: 'auto',
    fetch_format: 'auto',
  },
  presets: [
    {
      name: 'thumbnail',
      label: 'Thumbnail',
      transformation: {
        width: 300,
        height: 200,
        crop: 'fill',
      },
    },
    {
      name: 'featured',
      label: 'Featured',
      transformation: {
        width: 1920,
        height: 600,
        crop: 'fill',
      },
    },
    {
      name: 'grayscale',
      label: 'Grayscale',
      transformation: {
        effect: 'grayscale',
      },
    },
    {
      name: 'sepia',
      label: 'Sepia',
      transformation: {
        effect: 'sepia',
      },
    },
  ],
  enablePresetSelection: true,
  preserveOriginal: true,
}
```

### User Avatars

```typescript
transformations: {
  default: {
    quality: 'auto',
    fetch_format: 'auto',
  },
  presets: [
    {
      name: 'small',
      label: 'Small Avatar',
      transformation: {
        width: 50,
        height: 50,
        crop: 'fill',
        gravity: 'face',
        radius: 'max',
      },
    },
    {
      name: 'medium',
      label: 'Medium Avatar',
      transformation: {
        width: 100,
        height: 100,
        crop: 'fill',
        gravity: 'face',
        radius: 'max',
      },
    },
    {
      name: 'large',
      label: 'Large Avatar',
      transformation: {
        width: 200,
        height: 200,
        crop: 'fill',
        gravity: 'face',
        radius: 'max',
      },
    },
  ],
  enablePresetSelection: true,
  preserveOriginal: true,
}
```

## See Also

- [Frontend Transformations Guide](./frontend-transformations.md) - Apply transformations on the frontend
- [Cloudinary Transformation Reference](https://cloudinary.com/documentation/transformation_reference)
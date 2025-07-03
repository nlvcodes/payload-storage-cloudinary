# Transformation Presets

Transformation presets allow you to define reusable sets of Cloudinary transformations that can be applied to uploads.

## Configuration

Enable preset selection in your collection configuration:

```typescript
cloudinaryStorage({
  collections: {
    media: {
      enablePresetSelection: true,
      transformationPresets: [
        {
          name: 'thumbnail',
          label: 'Thumbnail',
          description: 'Small thumbnail for lists',
          transformations: {
            width: 150,
            height: 150,
            crop: 'fill',
            gravity: 'auto',
            quality: 'auto',
            fetch_format: 'auto',
          },
        },
      ],
    },
  },
})
```

## Using Built-in Presets

The plugin includes several common presets:

```typescript
import { cloudinaryStorage, commonPresets } from 'payload-storage-cloudinary'

cloudinaryStorage({
  collections: {
    media: {
      enablePresetSelection: true,
      transformationPresets: commonPresets,
    },
  },
})
```

### Available Built-in Presets

1. **thumbnail** - 150x150 square thumbnail
2. **card** - 400x300 card image
3. **hero** - 1920x600 hero/banner image
4. **responsive** - Auto-sizing responsive image
5. **watermarked** - Image with watermark overlay
6. **blurred** - Blurred background version
7. **grayscale** - Black and white conversion
8. **rounded** - Circular/rounded corners

## Creating Custom Presets

Define your own transformation presets:

```typescript
const customPresets = [
  {
    name: 'blog-feature',
    label: 'Blog Feature Image',
    description: 'Optimized for blog post headers',
    transformations: {
      width: 1200,
      height: 630,
      crop: 'fill',
      gravity: 'center',
      quality: 'auto:best',
      fetch_format: 'auto',
      effect: 'improve:outdoor',
    },
  },
  {
    name: 'product-grid',
    label: 'Product Grid',
    description: 'Square images for product listings',
    transformations: {
      width: 400,
      height: 400,
      crop: 'fill',
      gravity: 'auto',
      quality: 'auto',
      fetch_format: 'auto',
      background: 'white',
      pad: true,
    },
  },
]
```

## Transformation Options

Common transformation parameters:

### Sizing & Cropping
- `width`, `height` - Dimensions in pixels
- `crop` - How to crop ('fill', 'fit', 'pad', 'scale', etc.)
- `gravity` - Focus area ('center', 'face', 'auto', etc.)
- `aspect_ratio` - Maintain specific ratio (e.g., '16:9')

### Quality & Format
- `quality` - Image quality ('auto', 'auto:best', 'auto:good', 'auto:eco', 80, etc.)
- `fetch_format` - Auto-select format ('auto', 'webp', 'avif', etc.)
- `format` - Force specific format
- `dpr` - Device pixel ratio ('auto', 2.0, etc.)

### Effects
- `effect` - Apply effects ('grayscale', 'blur:300', 'improve', etc.)
- `angle` - Rotation angle
- `border` - Add border ('2px_solid_black')
- `radius` - Corner radius ('20', 'max' for circular)

### Overlays
- `overlay` - Text or image overlay
- `font_family`, `font_size` - Text styling
- `color` - Text color
- `background` - Background color

## Using Presets in Frontend

Generate URLs with specific presets:

```typescript
import { getTransformationUrl } from 'payload-storage-cloudinary'

// Use a preset
const thumbnailUrl = getTransformationUrl({
  publicId: doc.cloudinaryPublicId,
  version: doc.cloudinaryVersion,
  presetName: 'thumbnail',
  presets: yourPresets,
})

// Override preset with custom transformations
const customUrl = getTransformationUrl({
  publicId: doc.cloudinaryPublicId,
  version: doc.cloudinaryVersion,
  presetName: 'thumbnail',
  presets: yourPresets,
  customTransformations: {
    width: 200, // Override preset width
    effect: 'sepia', // Add additional effect
  },
})
```

## React Component Example

```tsx
import { getTransformationUrl } from 'payload-storage-cloudinary'

function ResponsiveImage({ doc, preset, alt }) {
  const imageUrl = getTransformationUrl({
    publicId: doc.cloudinaryPublicId,
    version: doc.cloudinaryVersion,
    presetName: preset,
    presets: mediaPresets,
  })
  
  const srcSet = [
    { width: 400, suffix: 'w_400' },
    { width: 800, suffix: 'w_800' },
    { width: 1200, suffix: 'w_1200' },
  ].map(({ width, suffix }) => 
    `${getTransformationUrl({
      publicId: doc.cloudinaryPublicId,
      version: doc.cloudinaryVersion,
      customTransformations: { width },
    })} ${width}w`
  ).join(', ')
  
  return (
    <img 
      src={imageUrl}
      srcSet={srcSet}
      sizes="(max-width: 400px) 400px, (max-width: 800px) 800px, 1200px"
      alt={alt}
    />
  )
}
```

## Best Practices

1. **Performance**: Use `quality: 'auto'` and `fetch_format: 'auto'` for optimal delivery
2. **Responsive**: Create multiple preset sizes for different breakpoints
3. **Consistency**: Use presets to maintain visual consistency across your site
4. **Caching**: Cloudinary caches transformed images, so don't worry about regeneration
5. **Testing**: Test presets with various image types before deploying
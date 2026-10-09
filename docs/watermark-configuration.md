# Watermark Configuration

The plugin supports watermarked or blurred previews of private files. Readers who may not get the original see a watermarked preview, signed when the original is `authenticated`, while the original stays private. See [Previews for Private Files](./public-transformation-example.md) for who gets which URL.

## Basic Configuration

```typescript
cloudinaryStorage({
  collections: {
    media: {
      privateFiles: true,
      transformations: {
        preserveOriginal: true, // Recommended for flexibility
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
      },
    },
  },
})
```

## Watermark Style Options

### Text Watermark Configuration

The text watermark supports the following style options:

- `fontFamily`: Font to use (e.g., 'Arial', 'Verdana', 'Times New Roman')
- `fontSize`: Size of the text (default: 50)
- `color`: Text color in RGB format (e.g., 'rgb:808080' for gray)
- `opacity`: Transparency level 0-100 (default: 50)
- `angle`: Rotation angle (default: -45 for diagonal)

### Advanced Watermark Configuration

```typescript
watermark: {
  defaultText: 'SAMPLE',
  style: {
    fontFamily: 'Arial',
    fontSize: 60,
    color: 'rgb:ffffff', // White text
    opacity: 80,
    angle: 0, // No rotation
  },
}
```

### Blur Alternative

You can use blur instead of watermarks for previews:

```typescript
blur: {
  effect: 'blur:1500', // Blur intensity (0-2000)
  quality: 50, // Image quality for preview
}
```

## How It Works

1. **Upload a file** with "Private File" checked
2. **Enable Preview** using the checkbox
3. **Choose transformation type**: watermark or blur
4. **Enter watermark text** (or use the default)
5. **Plugin builds** `previewUrl` when the document is read: a signed URL of the `authenticated` original with the watermark or blur applied

No separate preview asset is uploaded. With no `watermark` settings, the watermark text is `WATERMARK`.

## Admin Interface

The plugin automatically adds these fields to your admin interface:

- **Private File**: Checkbox to control file privacy
- **Enable Preview**: Turns the preview on for the document
- **Transformation Type**: Choose between watermark and blur
- **Watermark Text**: Custom text field (when watermark is selected)

## URL Generation

`previewUrl` carries the preview: the default transformations and selected presets, then the watermark or blur. `publicTransformationUrl` is deprecated. Versions before 1.3.0 set it, and new uploads don't.

### Example Watermark URL Structure

```
https://res.cloudinary.com/[cloud]/image/authenticated/
s--[signature]--/
[presets]/
c_scale,w_800/
a_-45,co_rgb:808080,e_anti_removal,fl_layer_apply.tiled,g_center,l_text:Arial_50_bold_letter_spacing_15:[watermark_text],o_50/
v[version]/[public_id].[format]
```

For an `authenticated` original, the signature covers every transformation, so Cloudinary answers 401 to a URL edited to remove the watermark. Don't splice transformations into it. A private file uploaded before 1.3.0 stays an `upload` asset with an unsigned preview until you run `migratePrivateAssets`. See [Files Uploaded Before 1.3.0](./public-transformation-example.md#files-uploaded-before-130).

## Frontend Usage

### Basic Usage

```tsx
function ImageWithPreview({ doc }) {
  if (doc.transformedUrl || doc.url) {
    // A public file, or a reader who may get the original
    return <img src={doc.transformedUrl || doc.url} alt={doc.alt} />
  }
  
  // A reader who may only see the preview
  if (doc.previewUrl) {
    return (
      <div>
        <img src={doc.previewUrl} alt={`${doc.alt} (preview)`} />
        <p>This is a watermarked preview. Log in to see the original.</p>
      </div>
    )
  }
  
  // No preview available
  return <div>Authentication required</div>
}
```

### With Combined Presets

`previewUrl` already carries the selected presets under the watermark or blur, so the basic example above covers it.

## Complete Configuration Example

```typescript
cloudinaryStorage({
  collections: {
    media: {
      privateFiles: true,
      transformations: {
        preserveOriginal: true,
        
        // Transformation presets
        presets: [
          {
            name: 'card',
            label: 'Card View',
            transformation: {
              width: 400,
              height: 400,
              crop: 'fill',
            },
          },
        ],
        enablePresetSelection: true,
        
        // Public previews
        publicTransformation: {
          enabled: true,
          watermark: {
            defaultText: 'SAMPLE',
            style: {
              fontFamily: 'Arial',
              fontSize: 60,
              color: 'rgb:ffffff',
              opacity: 80,
              angle: -45,
            },
          },
          blur: {
            effect: 'blur:2000',
            quality: 30,
          },
        },
      },
    },
  },
})
```

## Troubleshooting

### Watermark Not Visible
- Increase opacity (0-100)
- Change color to contrast with image background
- Adjust font size for better visibility
- Try different angles (-45, 0, 45)

### Blur Too Light/Heavy
- Adjust blur value (0-2000)
- Lower quality for more aggressive blur
- Consider combining with other effects

### No Preview URL Generated
- Verify `publicTransformation.enabled: true`
- Check that file is marked as private
- Ensure the editor checked "Enable Preview" in the admin interface
- Check that the reader may read the document under the collection's `read` access
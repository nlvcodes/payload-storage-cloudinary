# Previews for Private Files

This feature shows a watermarked or blurred preview of a private file to readers who may not get the original, for example visitors who haven't paid or signed up. The original stays an `authenticated` Cloudinary asset, and only the readers you allow get it.

## Overview

- A private file always uploads to Cloudinary as an `authenticated` asset, so nothing reaches it without a signed URL.
- The preview (`previewUrl`) is a signed URL of that asset with the watermark or blur applied. The signature covers the whole transformation, so editing the URL to drop the watermark or blur gets a 401 from Cloudinary. A private file uploaded before 1.3.0 stays a public `upload` asset until you run `migratePrivateAssets`, and its preview is unsigned until then. See [Files Uploaded Before 1.3.0](#files-uploaded-before-130).
- The plugin builds every URL when the document is read, after Payload has run the collection's `read` access, so each reader gets only the URLs they may have.

## Use Cases

Perfect for scenarios where you want to:
- Show watermarked previews of premium content
- Display blurred previews of private photos
- Allow public browsing with authentication-gated full access
- Create teasers for paid content

## Who Gets What

On a collection with `publicTransformation` enabled:

| Reader | `url`, `thumbnailURL`, `transformedUrl` | `previewUrl` |
|---|---|---|
| The collection's `read` access passes and `customAuthCheck` passes | Signed URLs of the original | The signed preview |
| The collection's `read` access passes but `customAuthCheck` refuses, or there is no `customAuthCheck` | `null` | The signed preview |
| The collection's `read` access refuses | No document (403 or 404) | No document |

`transformedUrl` is set only when `preserveOriginal` and `enablePresetSelection` are both on and there are presets or default transformations to apply. Otherwise it is `null`.

- **With no `customAuthCheck`, nobody gets the original through the plugin.** Add a `customAuthCheck` that lets through the readers who should get it.
- A document with its preview turned off gives a preview-only reader `null` in every URL field.
- A preview-only reader gets no thumbnail, since the thumbnail isn't watermarked.
- The signed URL endpoints answer 403 to a preview-only reader.
- Signed URLs don't expire. The preview is meant to be public, so that is fine for `previewUrl`. Treat the original's URLs as bearer links.
- A file uploaded before 1.3.0 and not yet migrated gets unsigned URLs. See [Files Uploaded Before 1.3.0](#files-uploaded-before-130).

## Configuration

### Basic Configuration

```typescript
cloudinaryStorage({
  cloudConfig: {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  },
  collections: {
    media: {
      privateFiles: {
        enabled: true,
        // Who gets the original. Everyone else who can read the document gets the preview.
        customAuthCheck: (req, doc) => Boolean(req.user),
      },
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

Your collection's `read` access must let preview readers read the document, for example `read: () => true` on a collection whose previews every visitor may see. The plugin then decides which URLs each reader gets.

### Advanced Configuration with Presets

```typescript
cloudinaryStorage({
  collections: {
    media: {
      privateFiles: {
        enabled: true,
        customAuthCheck: async (req, doc) => {
          // For example, members with an active subscription
          return Boolean(req.user?.subscriptionActive)
        },
      },
      transformations: {
        preserveOriginal: true,
        presets: [
          {
            name: 'card',
            label: 'Card View',
            transformations: {
              width: 400,
              height: 400,
              crop: 'fill',
              gravity: 'auto',
            },
          },
          {
            name: 'hero',
            label: 'Hero Image',
            transformations: {
              width: 1200,
              height: 600,
              crop: 'fill',
              gravity: 'auto',
            },
          },
        ],
        enablePresetSelection: true,
        publicTransformation: {
          enabled: true,
          watermark: {
            defaultText: 'SAMPLE',
            style: {
              fontFamily: 'Arial',
              fontSize: 60,
              color: 'rgb:ffffff',
              opacity: 80,
              angle: 0,
            },
          },
          blur: {
            effect: 'blur:1500',
            quality: 50,
          },
        },
      },
    },
  },
})
```

## How It Works

### Upload Process

1. **Upload File**: An editor uploads a file to the collection. A private file uploads as an `authenticated` asset.
2. **Privacy Control**: The editor can check or uncheck the "Private File" checkbox.
3. **Preset Selection**: The editor can select transformation presets (if enabled).
4. **Preview**: The editor checks "Enable Preview" and chooses watermark or blur. For a watermark, they can set the text per document.

Nothing else is uploaded. The plugin doesn't create a separate preview asset: the preview is a signed transformation of the original, built when the document is read.

### URL Fields

```typescript
{
  // Signed URLs of the original, or null for a reader without the original
  url: '...', // The original, with the default transformations
  transformedUrl: '...', // With the selected presets applied
  thumbnailURL: '...', // 150x150 for the admin UI

  // The signed preview, for every reader who may read the document
  previewUrl: '...', // Default transformations and selected presets, then the watermark or blur
}
```

A private file never returns `originalUrl`, and no response returns `cloudinaryUrl`.

### The Preview

`previewUrl` applies, in order:

1. The collection's default transformations
2. Each selected preset, in the order selected
3. The watermark or blur

It doesn't need a selected preset. With none selected, it is the watermark or blur alone.

The preview always carries a watermark or blur. If you turn on `publicTransformation` without `watermark` settings, the watermark uses the default text `WATERMARK`.

## Admin Interface

The admin interface provides:

1. **Private File**: Controls privacy per upload
2. **Transformation Presets**: Multi-select field for presets (if enabled)
3. **Enable Preview**: Turns the preview on or off for the document
4. **Transformation Type**: Watermark or blur
5. **Watermark Text**: The watermark text for this document
6. **Preview URL**: The signed preview, read-only

## Frontend Implementation

Fetch the document as the reader, so the URLs match what that reader may have. With the Local API, pass `req`. A Local API call without `req` reads as an anonymous visitor.

### Basic Usage

```tsx
function ImageWithPreview({ doc }: { doc: any }) {
  // A reader who may get the original
  if (doc.url) {
    return <img src={doc.url} alt={doc.alt} />
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

  // No preview for this document
  return <div>This image requires authentication</div>
}
```

### Gallery with Mixed Content

```tsx
function GalleryWithPreviews({ images }: { images: any[] }) {
  return (
    <div className="grid grid-cols-3 gap-4">
      {images.map((image) => (
        <div key={image.id} className="relative">
          {image.transformedUrl || image.url ? (
            // The reader may get the original
            <img
              src={image.transformedUrl || image.url}
              alt={image.alt}
              className="w-full h-auto"
            />
          ) : image.previewUrl ? (
            // Preview only
            <div>
              <img
                src={image.previewUrl}
                alt={`${image.alt} (preview)`}
                className="w-full h-auto"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
                <span className="text-white text-sm">Preview</span>
              </div>
            </div>
          ) : (
            // No preview available
            <div className="bg-gray-200 flex items-center justify-center h-48">
              <span className="text-gray-500">Private</span>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
```

Don't splice transformations into `previewUrl` or any other signed URL. The signature covers the transformation, so Cloudinary answers 401 to an edited URL. Add a preset instead.

## Watermark Configuration

### Text Watermarks

```typescript
watermark: {
  defaultText: 'PREVIEW', // Used when the document sets no text. Without it, 'WATERMARK'.
  textFieldName: 'watermarkText', // The per-document text field
  style: {
    fontFamily: 'Arial', // or 'Times', 'Helvetica', etc.
    fontSize: 50,
    fontWeight: 'bold',
    letterSpacing: 15,
    color: 'rgb:808080', // Gray color
    opacity: 50, // 50% transparency
    angle: -45, // Diagonal angle
    position: 'center', // Cloudinary gravity
  },
}
```

The text watermark is tiled across the image.

### Image Watermarks

```typescript
watermark: {
  imageId: 'brand/watermark', // Public ID of an image you uploaded to Cloudinary
  style: {
    opacity: 50,
    position: 'south_east',
  },
}
```

An image watermark is one logo in a corner, which can be cropped out of a downloaded preview. Prefer the tiled text watermark or blur for content you sell.

## Blur Configuration

```typescript
blur: {
  effect: 'blur:2000', // Heavy blur (0-2000)
  quality: 30, // Lower quality for previews
  width: 600, // The preview is scaled down to fit 600x600 by default
  height: 600,
}
```

## Files Uploaded Before 1.3.0

- Before 1.3.0, a `publicTransformation` collection uploaded its private originals as public `upload` assets. Until you migrate them with `migratePrivateAssets`, which moves them to `authenticated`, their originals stay public and their preview is unsigned, so the watermark or blur can be stripped from it. Their URLs keep working in the meantime.
- Before 1.3.0, turning on a document's preview also uploaded a separate public copy, named `<public ID>_public_watermark` or `<public ID>_public_blur`. The plugin no longer creates these copies. `migratePrivateAssets` lists the ones left in your Cloudinary account, and deleting them is up to you.
- `publicTransformationUrl` is deprecated. New uploads never set it, and a reader without the original reads it as `null`. Render `previewUrl` instead.

## Best Practices

1. **Set `customAuthCheck`** for the readers who should get the original. Without it, nobody gets it.
2. **Use `preserveOriginal: true`** for maximum flexibility
3. **Combine with transformation presets** for sophisticated previews
4. **Test watermark visibility** on different image backgrounds
5. **Consider blur intensity** based on your content
6. **Provide clear authentication prompts** for full access

## Troubleshooting

### Issue: Watermark Not Visible
- Increase opacity (0-100)
- Change color to contrast with image
- Adjust font size
- Try different angles

### Issue: Blur Too Light/Heavy
- Adjust blur value (0-2000)
- Lower quality for more aggressive blur
- Combine with other effects

### Issue: No Preview URL
- Check that `publicTransformation.enabled: true` and `privateFiles` are both set
- Verify the file is marked as private
- Ensure the editor checked "Enable Preview" on the document
- Check that the reader may read the document under the collection's `read` access

### Issue: Every Reader Gets Only the Preview
- The collection has no `customAuthCheck`, so nobody gets the original. Add one.
- A Local API call without `req` reads as an anonymous visitor. Pass `req`.

### Issue: 401 Errors on Preview URLs
- The URL was edited after the plugin built it. Use the URL as returned.

### Issue: 404 Errors on Preview URLs
- The asset was deleted, renamed, or changed type outside the plugin, so the stored public ID, version or type no longer match it. Check the asset in the Cloudinary console.

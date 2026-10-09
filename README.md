# Payload Storage Cloudinary Plugin

A powerful Cloudinary storage adapter for Payload CMS v3 that replaces local file storage with Cloudinary's cloud-based solution, providing automatic image optimization, transformations, and global CDN delivery.

## Features

- 🚀 **Seamless Cloudinary Integration** - Direct upload to Cloudinary with automatic URL generation
- 📁 **Dynamic Folder Management** - Type folder paths dynamically per upload
- 📂 **Smart Folder Organization** - Auto-create folders and move assets on folder change
- 🎨 **Transformation Presets** - Define reusable image transformation sets with multi-select support
- 📤 **Upload Queue System** - Handle large files with progress tracking and chunked uploads
- 🔒 **Private Files with Signed URLs** - Private files stored as Cloudinary `authenticated` assets, with per-file privacy control
- 🌊 **Signed Previews** - Watermarked or blurred previews of private files, signed so the watermark stays
- 🚫 **Smart Re-upload Prevention** - Prevents duplicate uploads when updating document fields
- 🌍 **Global CDN** - Fast content delivery worldwide
- 📱 **Responsive Images** - Automatic format and quality optimization

## Installation

```bash
npm install payload-storage-cloudinary
# or
yarn add payload-storage-cloudinary
# or
pnpm add payload-storage-cloudinary
```

## Quick Start

### 1. Set up environment variables

```env
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

### 2. Configure the plugin

```typescript
import { buildConfig } from 'payload'
import { cloudinaryStorage } from 'payload-storage-cloudinary'

export default buildConfig({
  // ... your config
  plugins: [
    cloudinaryStorage({
      cloudConfig: {
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
      },
      collections: {
        media: true, // Simple config - just works!
      },
    }),
  ],
})
```

### 3. Create your upload collection

```typescript
const Media: CollectionConfig = {
  slug: 'media',
  upload: {
    disableLocalStorage: true, // Required - handled by Cloudinary
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
    },
  ],
}
```

## Understanding URL Fields

When you upload a file, the plugin creates several URL fields:

- **`url`** - The main URL field (always contains the original URL when `preserveOriginal: true`)
- **`originalUrl`** - Direct URL to the original file without any transformations
- **`transformedUrl`** - URL with selected transformation presets applied (only when presets are selected)
- **`thumbnailURL`** - Always a 150x150 thumbnail for admin UI display
- **`publicTransformationUrl`** - Watermark/blur preview stored by versions before 1.3.0. New uploads don't set it; use `previewUrl`
- **`previewUrl`** - Combines transformation presets with watermark/blur for private files

### URL fields of a private file

On a collection with `privateFiles`, the plugin builds every URL of a private file when the document is read, after Payload has run the collection's `read` access. Nothing deliverable is stored in the database, so revoking a reader's access stops them getting new links.

- A reader who may get the original (the collection's `read` access passes, and `customAuthCheck` passes if you set one) gets signed `authenticated` URLs in `url`, `thumbnailURL` and `transformedUrl`, plus `previewUrl` when the document has a preview.
- A reader who may only see the preview gets `previewUrl`. `url`, `thumbnailURL` and `transformedUrl` are `null`.
- A reader with no access to the file gets `null` in every URL field.
- `cloudinaryUrl` is never in a response, and neither is the `originalUrl` of a private file. This holds for Local API reads too, where Payload skips field access by default. A public file gets `originalUrl` built at read time, on every Cloudinary collection with or without `privateFiles`.
- Signed URLs don't expire. Treat each one as a bearer link.

The URLs follow the reader of the request. A Local API call without `req` reads as an anonymous visitor, so pass `req` to get the URLs your user may see.

**Important:** When `preserveOriginal: true` (recommended), transformations are ONLY applied via URL parameters, never during upload. This ensures your original files remain untouched in Cloudinary.

## Basic Configuration Examples

### Simple Setup
```typescript
collections: {
  media: true, // Just works!
}
```

### With Folder Organization
```typescript
collections: {
  media: {
    folder: 'website/uploads',
  },
}
```

### With Transformations
```typescript
collections: {
  media: {
    transformations: {
      default: {
        quality: 'auto',
        fetch_format: 'auto',
      },
      preserveOriginal: true, // Recommended: keeps original file untransformed
    },
  },
}
```

## Advanced Features

### Dynamic Folders

Allow users to organize uploads into custom folders:

```typescript
collections: {
  media: {
    folder: {
      path: 'uploads', // Default folder
      enableDynamic: true, // Adds a text field for custom folder paths
      fieldName: 'cloudinaryFolder', // Custom field name (optional)
    },
  },
}
```

**Features:**
- Users can type paths like `products/2024` or `blog/images`
- Folders are automatically created in Cloudinary
- **Smart Asset Moving**: When you change the folder, the plugin moves the asset instead of re-uploading
- Uses Cloudinary's rename API to preserve the same asset, private (`authenticated`) assets included

### Transformation Presets with Multi-Select

Users can select multiple transformation presets that will be combined:

```typescript
import { cloudinaryStorage, commonPresets } from 'payload-storage-cloudinary'

collections: {
  media: {
    transformations: {
      default: {
        quality: 'auto',
        fetch_format: 'auto',
      },
      presets: commonPresets, // Built-in presets
      enablePresetSelection: true, // Shows multi-select dropdown
      preserveOriginal: true, // Recommended
    },
  },
}
```

**Built-in Common Presets:**
- `thumbnail` - 150x150 thumb crop
- `card` - 400x400 fill crop
- `banner` - 1200x600 fill crop
- `og-image` - 1200x630 Open Graph size
- `avatar` - 200x200 circular crop with face detection
- `blur` - Blurred preview image
- `grayscale` - Black and white conversion
- `pixelate` - Pixelated effect (20px blocks)

**How it works:**
1. Users can select multiple presets (e.g., "Grayscale" + "Card")
2. Transformations are combined and applied via URL only
3. The `transformedUrl` field contains the URL with all selected transformations
4. Original file remains untouched in Cloudinary


### Private Files with Signed Previews

Show a watermarked or blurred preview of a private file to readers who may not get the original. The preview is a signed URL of the `authenticated` original, so editing it to remove the watermark or blur breaks it. A file uploaded before 1.3.0 needs [migrating](./docs/public-transformation-example.md#files-uploaded-before-130) first:

```typescript
collections: {
  media: {
    privateFiles: {
      enabled: true,
      // Who gets the original. Without it, nobody does.
      customAuthCheck: (req) => Boolean(req.user),
    },
    transformations: {
      preserveOriginal: true,
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
}
```

**How it works:**
1. Editors mark files as private using the "Private File" checkbox. A private file uploads as an `authenticated` asset
2. They check "Enable Preview" on a document
3. They choose between "Watermark" or "Blur" transformation type
4. A reader who passes `customAuthCheck` gets the original URLs and `previewUrl`
5. Any other reader who may read the document gets only `previewUrl`, a signed URL with the selected presets, then the watermark or blur
6. For an `authenticated` original, which is every private upload from 1.3.0 on and every file `migratePrivateAssets` has moved, Cloudinary answers 401 to a preview URL edited to remove the watermark or blur. A private file uploaded before 1.3.0 stays an `upload` asset until migrated, so its original is public and its preview is unsigned. Run `migratePrivateAssets` (see [Files Uploaded Before 1.3.0](./docs/public-transformation-example.md#files-uploaded-before-130))
7. No separate preview asset is uploaded. The plugin builds `previewUrl` each time the document is read

See [Previews for Private Files](./docs/public-transformation-example.md).

### Upload Queue for Large Files

Handle large files with progress tracking:

```typescript
collections: {
  media: {
    uploadQueue: {
      enabled: true,
      maxConcurrentUploads: 3,
      enableChunkedUploads: true,
      largeFileThreshold: 100, // MB - files larger use chunked upload
      chunkSize: 20, // MB chunks
    },
  },
}
```

**File Size Limits:**
- Files over 100MB automatically use Cloudinary's `upload_large` API
- Cloudinary limits depend on your plan:
  - Free plans: typically 10MB for images, 100MB for videos
  - Paid plans: up to 1GB or more

### Complete Example

```typescript
import { buildConfig } from 'payload'
import { cloudinaryStorage, commonPresets } from 'payload-storage-cloudinary'

export default buildConfig({
  collections: [
    {
      slug: 'media',
      access: {
        // Everyone reads the document, so visitors can get the public preview.
        // customAuthCheck below decides who gets the original.
        read: () => true,
      },
      upload: {
        disableLocalStorage: true,
      },
      fields: [
        {
          name: 'alt',
          type: 'text',
        },
      ],
    },
  ],
  plugins: [
    cloudinaryStorage({
      cloudConfig: {
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
        api_key: process.env.CLOUDINARY_API_KEY!,
        api_secret: process.env.CLOUDINARY_API_SECRET!,
      },
      collections: {
        media: {
          // Folder configuration
          folder: {
            path: 'uploads',
            enableDynamic: true,
          },
          
          // Transformation configuration
          transformations: {
            default: {
              quality: 'auto',
              fetch_format: 'auto',
            },
            presets: commonPresets,
            enablePresetSelection: true,
            preserveOriginal: true, // Recommended
            
            // Public preview for private files
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
          
          // Upload queue for large files
          uploadQueue: {
            enabled: true,
            maxConcurrentUploads: 3,
            enableChunkedUploads: true,
            largeFileThreshold: 100, // MB
          },
          
          // Security: with publicTransformation, only callers who pass
          // customAuthCheck get the original. Without it, nobody does.
          privateFiles: {
            enabled: true,
            customAuthCheck: (req) => Boolean(req.user),
          },
          
          // Options
          resourceType: 'auto',
          deleteFromCloudinary: true,
        },
      },
    }),
  ],
})
```

## Frontend Usage

### Using the Stored URLs

```tsx
function ProductImage({ doc }) {
  // Use transformedUrl if transformations were selected, otherwise use url
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

### Applying Custom Transformations

Since transformations are applied via URL when `preserveOriginal: true`, you can easily create variations:

```typescript
import { getTransformationUrl } from 'payload-storage-cloudinary'

// Create a thumbnail
const thumbnailUrl = getTransformationUrl({
  publicId: doc.cloudinaryPublicId,
  version: doc.cloudinaryVersion,
  customTransformations: {
    width: 200,
    height: 200,
    crop: 'fill',
    gravity: 'auto',
  }
})

// Create a responsive image
const responsiveUrl = getTransformationUrl({
  publicId: doc.cloudinaryPublicId,
  version: doc.cloudinaryVersion,
  customTransformations: {
    width: 'auto',
    dpr: 'auto',
    quality: 'auto',
    fetch_format: 'auto',
  }
})
```

`getTransformationUrl`, `generateSignedURL` and `generateDownloadURL` are primitives. They build a URL for any public ID with any transformation and check no access, and for an `authenticated` asset they sign it. Call them only from trusted server code, never with a public ID or transformations taken from a request. To serve a reader, use the server helpers below or the signed URL endpoints. See [Primitives](./docs/signed-urls.md#primitives-generatesignedurl-generatedownloadurl-and-gettransformationurl).

### Handling Private Files

```tsx
import { useSignedURL, createPrivateImageComponent } from 'payload-storage-cloudinary/client'
import React from 'react'

// Option 1: Use the hook
function MyPrivateImage({ doc }) {
  const { url, loading, error } = useSignedURL('media', doc?.id, {
    react: React // Required in Next.js
  })
  
  if (loading) return <div>Loading...</div>
  if (error) return <div>Error loading image</div>
  
  return url ? <img src={url} alt={doc.alt} /> : null
}

// Option 2: Use the pre-built component
const PrivateImage = createPrivateImageComponent(React)

<PrivateImage 
  doc={doc} 
  collection="media" 
  alt="My private image"
  className="w-full h-auto"
/>
```

On the server, the helpers enforce your collection's `read` access and `customAuthCheck`. Pass the request, so access resolves against the real reader:

```typescript
import { getPrivateImageURL } from 'payload-storage-cloudinary'

// null when this reader may not have the file
const url = await getPrivateImageURL(doc, { payload, collection: 'media', req })
```

A call with no `req` and no `user` is anonymous. A trusted server job with no reader passes `overrideAccess: true`. See [Server Helpers](./docs/signed-urls.md#server-helpers).

To ask whether a reader may get the original without building a URL, call `isAccessAllowedByID({ req, collection, id })`. It decides exactly as the endpoints and the helpers do, in every locale, and returns `true` exactly when `getSignedURL` returns a URL. The older `isAccessAllowed(req, doc, config)` is deprecated: it decides only on the document you pass, so never pass it a raw database row on a localized collection. See [`isAccessAllowedByID`](./docs/signed-urls.md#isaccessallowedbyid).

`getSignedURL`, `getSignedURLs` and `getServerImageURL` sign caller `transformations` only from the same allowlist as the endpoints (`width`, `height`, `crop`, `gravity`, `quality`, `fetch_format`, `dpr`, `aspect_ratio`). Anything else throws, and nothing is signed. Server code that builds a transformation beyond it, such as a watermark overlay, passes `overrideTransformationAllowlist: true`. Never pass request input with it. See [Transformations in the server helpers](./docs/signed-urls.md#transformations-in-the-server-helpers).

### Working with Previews

```tsx
function ProtectedImage({ doc }) {
  if (doc.url) {
    // A public file, or a reader who may get the original
    return <img src={doc.url} alt={doc.alt} />
  }

  if (doc.previewUrl) {
    // Show the watermarked or blurred preview
    return (
      <div>
        <img src={doc.previewUrl} alt={`${doc.alt} (preview)`} />
        <p>This is a preview. Log in to see full quality.</p>
      </div>
    )
  }

  // No preview available
  return <div>This image requires authentication</div>
}
```

## Important Changes in v1.0.7+

### No More Re-uploads
The plugin now intelligently prevents re-uploads when you:
- Change transformation presets
- Update alt text or other fields
- Modify folder paths (uses rename instead)
- Toggle privacy settings (renames the asset between `upload` and `authenticated` instead)

### Deletion Protection
The plugin protects against accidental file deletion from Cloudinary:
- **During updates**: Files are protected when changing transformations, watermarks, or metadata
- **During actual deletion**: Files are properly removed when you delete the document, private (`authenticated`) files included
- **Why this matters**: Prevents a bug in Payload's cloud storage plugin that could delete files during updates
- **Logs**: You'll see warnings when deletion is prevented during updates

### Signed Previews (1.3.0)
A preview of an `authenticated` original, which is every private upload from 1.3.0 on and every file `migratePrivateAssets` has moved, is a signed URL:
- **Watermarks and blurs are signed in**: Editing the URL to remove them breaks the signature, and Cloudinary answers 401
- **No public copy**: The plugin no longer uploads a separate preview asset. Copies left by older versions stay in Cloudinary until you delete them
- **One field**: `previewUrl` carries the preview. `publicTransformationUrl` is deprecated
- **Original protected**: The original is an `authenticated` asset, and only readers who pass `customAuthCheck` get it
- **Files uploaded before 1.3.0**: A private file on a `publicTransformation` collection stays an `upload` asset until migrated, so its original is public and its preview is unsigned. Run `migratePrivateAssets`. See [Files Uploaded Before 1.3.0](./docs/public-transformation-example.md#files-uploaded-before-130)

### URL Structure
- `url` always contains the original URL (when `preserveOriginal: true`)
- `transformedUrl` contains URL with transformation presets
- `previewUrl` combines presets with watermark/blur, signed for an `authenticated` original

### Multi-Select Transformations
- Transformation presets now support multiple selections
- Selected transformations are combined in order
- All transformations happen via URL, not during upload

## Documentation

- [Frontend Transformations Guide](./docs/frontend-transformations.md) - Applying transformations in your app
- [Private Images Guide](./docs/private-images-guide.md) - Complete guide for private files
- [Dynamic Folders Guide](./docs/dynamic-folders.md) - Folder organization strategies
- [Transformation Presets Guide](./docs/transformations.md) - Creating and using presets
- [Upload Queue Guide](./docs/upload-queue.md) - Handling large files
- [Public Transformation Guide](./docs/public-transformation-example.md) - Watermarks and blur effects

## TypeScript

Full TypeScript support with type definitions included:

```typescript
import type { 
  CloudinaryStorageOptions,
  CloudinaryCollectionConfig,
  TransformationPreset,
  SignedURLConfig,
  TransformationConfig,
  FolderConfig,
} from 'payload-storage-cloudinary'
```

## Requirements

- Payload CMS v3.0.0 or higher
- Node.js 18 or higher
- Cloudinary account with API credentials

## License

MIT

## Support

- [GitHub Issues](https://github.com/nick-vogel/payload-storage-cloudinary/issues)
- [Security policy](./SECURITY.md) (report vulnerabilities privately, not as issues)
- [Documentation](./docs)
- [Payload CMS Discord](https://discord.gg/payloadcms)
- [Cloudinary Documentation](https://cloudinary.com/documentation)

## Credits

Built with ❤️ for the Payload CMS community.
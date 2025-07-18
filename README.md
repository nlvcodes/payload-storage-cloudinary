# Payload Storage Cloudinary Plugin

A powerful Cloudinary storage adapter for Payload CMS v3 that replaces local file storage with Cloudinary's cloud-based solution, providing automatic image optimization, transformations, and global CDN delivery.

## Features

- 🚀 **Seamless Cloudinary Integration** - Direct upload to Cloudinary with automatic URL generation
- 📁 **Dynamic Folder Management** - Type folder paths dynamically per upload
- 📂 **Smart Folder Organization** - Auto-create folders and move assets on folder change
- 🎨 **Transformation Presets** - Define reusable image transformation sets with multi-select support
- 📤 **Upload Queue System** - Handle large files with progress tracking and chunked uploads
- 🔒 **Private Files with Signed URLs** - Secure, time-limited access with per-file privacy control
- 🌊 **Public Previews** - Watermarked or blurred public previews for private files
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
- **`publicTransformationUrl`** - Public URL with watermark/blur for private files (when enabled)
- **`previewUrl`** - Combines transformation presets with watermark/blur for private files

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
- Uses Cloudinary's rename API to preserve the same asset

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


### Private Files with Secure Public Previews

Enable permanently watermarked or blurred public previews for private files. When enabled, the plugin creates a separate Cloudinary asset with transformations baked in, preventing removal via URL manipulation:

```typescript
collections: {
  media: {
    privateFiles: true, // Enable per-file privacy control
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
1. Users mark files as private using the "Private File" checkbox
2. They can enable "Public Preview" to generate a permanently transformed version
3. Choose between "Watermark" or "Blur" transformation type
4. A separate Cloudinary asset is created with transformations baked in
5. Both `publicTransformationUrl` and `previewUrl` point to this secure asset
6. Watermarks/blurs cannot be removed by URL manipulation
7. Changes to watermark text or type automatically recreate the public version

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
        read: () => true, // Required for private files
      },
      hooks: {
        afterRead: [
          ({ doc, req }) => {
            // Check if file requires authentication
            if ((doc.requiresSignedURL || doc.isPrivate) && !req.user) {
              return null // Return null for unauthorized access
            }
            return doc
          },
        ],
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
          
          // Security
          privateFiles: true,
          
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

### Working with Public Previews

```tsx
function ProtectedImage({ doc }) {
  if (!doc.isPrivate) {
    // Public file - use normal URL
    return <img src={doc.url} alt={doc.alt} />
  }
  
  if (doc.publicTransformationUrl) {
    // Show watermarked/blurred preview
    return (
      <div>
        <img src={doc.publicTransformationUrl} alt={`${doc.alt} - Preview`} />
        <p>This is a preview. Login to see full quality.</p>
      </div>
    )
  }
  
  // No public preview available
  return <div>This image requires authentication</div>
}
```

## Important Changes in v1.0.7+

### No More Re-uploads
The plugin now intelligently prevents re-uploads when you:
- Change transformation presets
- Update alt text or other fields
- Modify folder paths (uses rename instead)
- Toggle privacy settings

### Deletion Protection
The plugin protects against accidental file deletion from Cloudinary:
- **During updates**: Files are protected when changing transformations, watermarks, or metadata
- **During actual deletion**: Files are properly removed when you delete the document
- **Why this matters**: Prevents a bug in Payload's cloud storage plugin that could delete files during updates
- **Logs**: You'll see warnings when deletion is prevented during updates

### Secure Public Previews
Public previews now create permanent transformed copies:
- **Watermarks/blurs are baked in**: Cannot be removed via URL manipulation
- **Automatic management**: Old versions deleted when settings change
- **Dual fields**: Both `publicTransformationUrl` and `previewUrl` populated
- **Original protected**: Private original file remains untouched

### URL Structure
- `url` always contains the original URL (when `preserveOriginal: true`)
- `transformedUrl` contains URL with transformation presets
- `publicTransformationUrl` contains watermarked/blurred public preview
- `previewUrl` combines presets with watermark/blur

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

- [GitHub Issues](https://github.com/nlvcodes/payload-storage-cloudinary/issues)
- [Documentation](./docs)
- [Payload CMS Discord](https://discord.gg/payloadcms)
- [Cloudinary Documentation](https://cloudinary.com/documentation)

## Credits

Built with ❤️ for the Payload CMS community.
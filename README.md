# Payload Storage Cloudinary Plugin

A powerful Cloudinary storage adapter for Payload CMS v3 that replaces local file storage with Cloudinary's cloud-based solution, providing automatic image optimization, transformations, and global CDN delivery.

## Features

- 🚀 **Seamless Cloudinary Integration** - Direct upload to Cloudinary with automatic URL generation
- 📁 **Dynamic Folder Selection** - Dropdown with real-time folder fetching from Cloudinary
- 📂 **Smart Folder Management** - Choose from existing folders or create new ones on the fly
- 🎨 **Transformation Presets** - Define reusable image transformation sets
- 📤 **Upload Queue System** - Handle large files with progress tracking
- 🔒 **Signed URLs** - Secure, time-limited access to private content
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
        media: true, // Enable for media collection
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
      quality: 'auto',
      fetch_format: 'auto',
    },
  },
}
```

**Note:** These transformations are applied to the `url` field. The `thumbnailURL` always uses a 150x150 thumbnail. See the [Frontend Transformations Guide](./docs/frontend-transformations.md) to apply different transformations on your frontend.

## Advanced Features

### Dynamic Folders
```typescript
collections: {
  media: {
    folder: {
      path: 'uploads', // Default folder
      enableDynamic: true, // Let users choose per upload
      fieldName: 'cloudinaryFolder', // Custom field name
    },
  },
}
```

// Or use the shorthand for just a default folder:
collections: {
  media: {
    folder: 'uploads',
  },
}

// Simple private files configuration:
collections: {
  documents: {
    privateFiles: true, // Files require signed URLs with 1-hour expiry
  },
}


### Transformations
```typescript
import { commonPresets } from 'payload-storage-cloudinary'

collections: {
  media: {
    transformations: {
      default: {
        quality: 'auto',
        fetch_format: 'auto',
      },
      presets: commonPresets, // Or define your own
      enablePresetSelection: true,
      preserveOriginal: true, // Keep original file untransformed
    },
  },
}
```

// Or use the shorthand for just default transformations:
collections: {
  media: {
    transformations: {
      quality: 'auto',
      fetch_format: 'auto',
    },
  },
}

### Upload Queue
```typescript
collections: {
  media: {
    uploadQueue: {
      enabled: true,
      maxConcurrentUploads: 3,
      chunkSize: 20, // MB
    },
  },
}
```

### Private Files with Signed URLs
```typescript
collections: {
  documents: {
    privateFiles: true, // Enables signed URLs with default 1-hour expiry
  },
}

// Or with custom signed URL configuration:
collections: {
  documents: {
    privateFiles: {
      enabled: true,
      expiresIn: 7200, // 2 hours
      authTypes: ['upload', 'authenticated'],
      includeTransformations: true,
    },
  },
}
```

When `privateFiles` is set to `true`, it automatically enables signed URLs with a default expiry of 1 hour. You can also pass a full signed URL configuration object for more control.

### Control Cloudinary Deletion
```typescript
collections: {
  media: {
    deleteFromCloudinary: false, // Keep files in Cloudinary when deleted from Payload
  },
}
```

By default, files are deleted from Cloudinary when removed from Payload. Set `deleteFromCloudinary: false` to keep files in Cloudinary even after deletion from Payload.

## Complete Example

```typescript
import { buildConfig } from 'payload'
import { cloudinaryStorage, commonPresets } from 'payload-storage-cloudinary'

export default buildConfig({
  collections: [
    {
      slug: 'media',
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
            fieldName: 'cloudinaryFolder',
          },
          
          // Transformation configuration
          transformations: {
            default: {
              quality: 'auto',
              fetch_format: 'auto',
            },
            presets: commonPresets,
            enablePresetSelection: true,
            preserveOriginal: true,
          },
          
          // Upload queue for large files
          uploadQueue: {
            enabled: true,
            maxConcurrentUploads: 3,
            enableChunkedUploads: true,
            largeFileThreshold: 100, // MB
          },
          
          // Resource type
          resourceType: 'auto', // Automatically detect image/video/raw
          
          // Deletion behavior
          deleteFromCloudinary: true, // Delete from Cloudinary when deleted in Payload (default: true)
        },
      },
    }),
  ],
})
```

## Frontend Usage

When you upload a file, Cloudinary stores these fields in your document:
- `url` - The default URL (with any default transformations applied)
- `thumbnailURL` - A 150x150 thumbnail for admin UI
- `cloudinaryPublicId` - The Cloudinary public ID
- `cloudinaryVersion` - Version for cache busting
- `transformationPreset` - Selected preset name (if preset selection is enabled)

### Display the Original Image
```tsx
function ProductImage({ doc }) {
  return (
    <img 
      src={doc.url} 
      alt={doc.alt}
      width={doc.width}
      height={doc.height}
    />
  )
}
```

### Apply Transformations on the Frontend

The `url` field contains whatever default transformations you configured. To apply different transformations on the frontend, you have several options:

#### Option 1: Direct URL Manipulation (Simplest)
```typescript
// The URL structure is: https://res.cloudinary.com/[cloud-name]/image/upload/[transformations]/[version]/[public-id].[format]
function getTransformedUrl(originalUrl: string, transformations: string) {
  // Replace or add transformations in the URL
  const parts = originalUrl.split('/upload/')
  return `${parts[0]}/upload/${transformations}/${parts[1]}`
}

// Example usage:
const heroUrl = getTransformedUrl(doc.url, 'w_1920,h_600,c_fill,q_auto,f_auto')
const thumbnailUrl = getTransformedUrl(doc.url, 'w_150,h_150,c_fill,q_auto')
```

#### Option 2: Using the Helper Function (Type-safe)
```typescript
import { getTransformationUrl, commonPresets } from 'payload-storage-cloudinary'

// Using a preset
const thumbnailUrl = getTransformationUrl({
  publicId: doc.cloudinaryPublicId,
  version: doc.cloudinaryVersion,
  presetName: 'thumbnail',
  presets: commonPresets,
})

// Using custom transformations
const customUrl = getTransformationUrl({
  publicId: doc.cloudinaryPublicId,
  version: doc.cloudinaryVersion,
  customTransformations: {
    width: 800,
    height: 400,
    crop: 'fill',
    quality: 'auto',
    fetch_format: 'auto',
  }
})

// Combining preset with overrides
const modifiedPresetUrl = getTransformationUrl({
  publicId: doc.cloudinaryPublicId,
  version: doc.cloudinaryVersion,
  presetName: 'card',
  presets: commonPresets,
  customTransformations: {
    width: 600, // Override the preset's width
  }
})
```

#### Option 3: Build Your Own URL (Most Control)
```typescript
// If you need full control over the URL generation
function buildCloudinaryUrl(doc: any, transformations: Record<string, any>) {
  const baseUrl = 'https://res.cloudinary.com/your-cloud-name/image/upload'
  
  // Convert transformation object to URL parameters
  const transforms = Object.entries(transformations)
    .map(([key, value]) => `${key}_${value}`)
    .join(',')
  
  return `${baseUrl}/${transforms}/v${doc.cloudinaryVersion}/${doc.cloudinaryPublicId}`
}

// Example usage:
const responsiveUrl = buildCloudinaryUrl(doc, {
  w: 'auto',
  q: 'auto',
  f: 'auto',
  dpr: 'auto',
})
```

### Common Transformation Examples
```typescript
// Responsive images with srcset
function ResponsiveImage({ doc }) {
  const widths = [320, 640, 1024, 1920]
  const srcSet = widths
    .map(w => `${getTransformedUrl(doc.url, `w_${w},q_auto,f_auto`)} ${w}w`)
    .join(', ')
  
  return (
    <img 
      src={getTransformedUrl(doc.url, 'w_1024,q_auto,f_auto')}
      srcSet={srcSet}
      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
      alt={doc.alt}
    />
  )
}

// Lazy loading with blur placeholder
function LazyImage({ doc }) {
  const placeholderUrl = getTransformedUrl(doc.url, 'w_50,e_blur:1000,q_1,f_auto')
  const fullUrl = getTransformedUrl(doc.url, 'w_800,q_auto,f_auto')
  
  return (
    <img 
      src={placeholderUrl}
      data-src={fullUrl}
      loading="lazy"
      alt={doc.alt}
    />
  )
}
```

### Handle Private Files
```typescript
async function getProtectedImage(docId: string) {
  const response = await fetch(`/api/media/signed-url/${docId}`)
  const { url } = await response.json()
  return url
}

// For React components
function PrivateImage({ docId }: { docId: string }) {
  const [url, setUrl] = useState<string>()
  
  useEffect(() => {
    getProtectedImage(docId).then(setUrl)
  }, [docId])
  
  return url ? <img src={url} alt="" /> : <div>Loading...</div>
}
```

## Documentation

- [Frontend Transformations Guide](./docs/frontend-transformations.md) - **Start here if images look wrong**
- [Dynamic Folders Guide](./docs/dynamic-folders.md)
- [Folder Management Guide](./docs/folder-management.md)
- [Transformation Presets Guide](./docs/transformation-presets.md)
- [Transformations Guide](./docs/transformations.md)
- [Upload Queue Guide](./docs/upload-queue.md)
- [Signed URLs Guide](./docs/signed-urls.md)

## Advanced Folder Management

### Dynamic Folder Selection with Dropdown
The plugin now supports dynamic folder selection with a dropdown that fetches folders directly from your Cloudinary account:

```typescript
collections: {
  media: {
    folder: {
      path: 'uploads', // Default folder
      enableDynamic: true, // Enable dynamic folder selection
      fieldName: 'cloudinaryFolder', // Field name for folder storage
      useFolderSelect: true, // Enable dropdown folder selection
    },
  },
}
```

When `useFolderSelect` is enabled:
- A dropdown field appears in the upload form with radio buttons to toggle between:
  - **Select existing folder**: Choose from a dropdown of all folders in your Cloudinary account (including nested folders)
  - **Create new folder**: Type a custom folder path that will be created on upload
- Folders are automatically fetched from your Cloudinary account using the Admin API
- All nested folders are displayed in the dropdown
- The selected folder is stored with the upload

### Manual Folder Input
If you prefer manual folder input or want a simpler implementation:

```typescript
collections: {
  media: {
    folder: {
      path: 'uploads',
      enableDynamic: true, // Allow manual folder input
      // useFolderSelect: false (or omitted)
    },
  },
}
```

This provides a text field where users can manually type folder paths.

### Known Limitations

- **Save button activation**: Currently, changing the folder selection does not automatically activate the save button in Payload CMS. This is due to limitations in how custom field components integrate with Payload's form state management. Users need to make another change to the document to enable saving after selecting a folder.

## Requirements

- Payload CMS v3.0.0 or higher
- Node.js 18 or higher
- Cloudinary account with API credentials

## Migration from Local Storage

1. Install and configure the plugin
2. Upload new files will automatically go to Cloudinary
3. Existing files remain in local storage (migration script coming soon)

## TypeScript

Full TypeScript support with type definitions included.

```typescript
import type { 
  CloudinaryStorageOptions,
  TransformationPreset,
  SignedURLConfig 
} from 'payload-storage-cloudinary'
```

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

## License

MIT

## Support

- [GitHub Issues](https://github.com/your-repo/issues)
- [Documentation](./docs)
- [Cloudinary Docs](https://cloudinary.com/documentation)

## Credits

Built with ❤️ for the Payload CMS community.
# Payload Storage Cloudinary Plugin

A powerful Cloudinary storage adapter for Payload CMS v3 that replaces local file storage with Cloudinary's cloud-based solution, providing automatic image optimization, transformations, and global CDN delivery.

## Features

- 🚀 **Seamless Cloudinary Integration** - Direct upload to Cloudinary with automatic URL generation
- 📁 **Dynamic Folder Management** - Organize uploads with flexible folder structures
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

## Advanced Features

### Dynamic Folders
```typescript
collections: {
  media: {
    enableDynamicFolders: true,
    folder: 'uploads', // Default folder
    folderField: 'cloudinaryFolder', // Let users choose
  },
}
```

### Transformation Presets
```typescript
import { commonPresets } from 'payload-storage-cloudinary'

collections: {
  media: {
    enablePresetSelection: true,
    transformationPresets: commonPresets, // Or define your own
  },
}
```

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
    privateFiles: true,
    signedURLs: {
      enabled: true,
      expiresIn: 3600, // 1 hour
    },
  },
}
```

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
          // Folder organization
          enableDynamicFolders: true,
          folder: 'uploads',
          
          // Transformation presets
          enablePresetSelection: true,
          transformationPresets: commonPresets,
          
          // Upload queue for large files
          uploadQueue: {
            enabled: true,
            maxConcurrentUploads: 3,
          },
          
          // Default transformations
          transformations: {
            quality: 'auto',
            fetch_format: 'auto',
          },
        },
      },
    }),
  ],
})
```

## Frontend Usage

### Display an Image
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

### Generate Transformation URL
```typescript
import { getTransformationUrl } from 'payload-storage-cloudinary'

const thumbnailUrl = getTransformationUrl({
  publicId: doc.cloudinaryPublicId,
  version: doc.cloudinaryVersion,
  presetName: 'thumbnail',
  presets: commonPresets,
})
```

### Handle Private Files
```typescript
async function getProtectedImage(docId) {
  const response = await fetch(`/api/media/signed-url/${docId}`)
  const { url } = await response.json()
  return url
}
```

## Documentation

- [Dynamic Folders Guide](./docs/dynamic-folders.md)
- [Transformation Presets Guide](./docs/transformation-presets.md)
- [Upload Queue Guide](./docs/upload-queue.md)
- [Signed URLs Guide](./docs/signed-urls.md)

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
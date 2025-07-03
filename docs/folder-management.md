# Cloudinary Folder Management

Organize your uploads into folders with flexible configuration options.

## Overview

The folder management feature provides:
- **Static folders** - Set a fixed folder for all uploads
- **Dynamic folders** - Let users specify folders during upload
- **Custom field names** - Use your own field name for folder selection
- **Automatic folder creation** - Folders are created automatically in Cloudinary

## Configuration

### Static Folder (Simple)

```typescript
cloudinaryStorage({
  collections: {
    media: {
      folder: 'uploads', // All uploads go to 'uploads' folder
    },
  },
})
```

### Dynamic Folder Input

```typescript
cloudinaryStorage({
  collections: {
    media: {
      folder: {
        path: 'uploads', // Default folder
        enableDynamic: true, // Show folder input field
        fieldName: 'cloudinaryFolder', // Field name (optional)
      },
    },
  },
})
```

### Custom Field Implementation

```typescript
// Plugin configuration
cloudinaryStorage({
  collections: {
    media: {
      folder: {
        path: 'uploads',
        enableDynamic: true,
        skipFieldCreation: true, // Don't auto-create field
      },
    },
  },
})

// Then add your own field to the collection
const Media: CollectionConfig = {
  slug: 'media',
  fields: [
    {
      name: 'cloudinaryFolder',
      type: 'text',
      label: 'Upload Folder',
      admin: {
        description: 'Enter folder path (e.g., products/2024)',
      },
    },
  ],
}
```

## How It Works

1. **Static Mode**: All files uploaded to the configured folder
2. **Dynamic Mode**: Users enter folder path in a text field
3. **Auto-Creation**: Folders are created automatically on first upload
4. **Path Cleaning**: Leading/trailing slashes are removed automatically

## Examples

### User Input → Cloudinary Folder
- `products` → `products/`
- `products/2024` → `products/2024/`
- `/products/` → `products/` (cleaned)
- `products/2024/summer` → `products/2024/summer/`
- `` (empty) → uses default or root folder

## Configuration Options

| Option | Type | Description |
|--------|------|-------------|
| `folder` | string \| object | Folder configuration |
| `folder.path` | string | Default folder path |
| `folder.enableDynamic` | boolean | Enable user input |
| `folder.fieldName` | string | Custom field name (default: 'cloudinaryFolder') |
| `folder.skipFieldCreation` | boolean | Skip automatic field creation |

## Best Practices

1. **Folder Structure**: Plan your hierarchy
   ```
   uploads/
   ├── media/
   │   ├── 2024/
   │   └── 2025/
   ├── products/
   │   ├── category-a/
   │   └── category-b/
   └── documents/
   ```

2. **Naming Conventions**:
   - Use lowercase: `products` not `Products`
   - Use hyphens: `product-images` not `product_images`
   - Be descriptive: `blog-posts/2024` not `bp/24`

3. **Organization Tips**:
   - By date: `media/2024/01`
   - By type: `images/banners`
   - By feature: `products/thumbnails`

## Complete Example

```typescript
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
          folder: {
            path: 'uploads',
            enableDynamic: true,
          },
        },
      },
    }),
  ],
})
```

## Notes

- Cloudinary automatically creates folders on first upload
- Folders cannot be deleted via this plugin (use Cloudinary dashboard)
- Empty folders don't appear in Cloudinary until they contain files
- Folder names are case-sensitive in Cloudinary
- Use forward slashes (/) for folder hierarchy
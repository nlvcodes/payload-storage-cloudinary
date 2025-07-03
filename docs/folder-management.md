# Cloudinary Folder Management

Flexible folder management with the ability to select from common folders or create new ones.

## Overview

The folder management feature provides:
- **Select common folders** from a predefined list
- **Create new folders** by typing custom paths
- **Radio toggle** to switch between select and text input
- **Automatic folder creation** on upload
- **Customizable folder list** via configuration

## Configuration

### Basic Setup

```typescript
cloudinaryStorage({
  collections: {
    media: {
      enableDynamicFolders: true,
      folder: 'uploads', // Default folder
    },
  },
})
```


### Custom Field Name

```typescript
collections: {
  media: {
    enableDynamicFolders: true,
    folderField: 'uploadFolder', // Custom field name
    folder: 'media/2024', // Default folder
  },
}
```

## How It Works

1. **Radio Toggle**: Users choose between "Select existing folder" or "Enter custom path"
2. **Folder Select**: Dropdown with predefined folder options
3. **Custom Path**: Text input for creating new folder structures
4. **Auto-Creation**: New folders are created automatically on upload
5. **Path Cleaning**: Leading/trailing slashes are removed automatically
6. **Default List**: If no custom folders specified, uses common defaults

## Examples

### User Input → Cloudinary Folder
- `products` → `products/`
- `products/2024` → `products/2024/`
- `/products/` → `products/`
- `products/2024/summer` → `products/2024/summer/`
- `` (empty) → (root folder)

## Features

- **No Pre-Setup**: Folders don't need to exist beforehand
- **Flexible Paths**: Any valid folder path is accepted
- **Clean URLs**: Paths are normalized automatically
- **Suggestions**: Common folders shown in field description
- **Per-Upload Control**: Each upload can go to a different folder

## Best Practices

1. **Folder Structure**: Plan your folder hierarchy
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

## Configuration Options

| Option | Type | Description |
|--------|------|-------------|
| `enableDynamicFolders` | boolean | Enable folder input field |
| `folder` | string | Default folder path |
| `folderField` | string | Custom field name (default: 'cloudinaryFolder') |

## Example Implementation

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
          enableDynamicFolders: true,
          folder: 'uploads',
          commonFolders: [
            'uploads',
            'media/images',
            'media/videos',
            'products/photos',
            'products/thumbnails',
            'blog/featured',
            'blog/content',
          ],
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
- Dynamic folder fetching from Cloudinary API is not currently supported due to Payload v3 custom field limitations

## Note on Dynamic Folder Selection

Dynamic folder selection from Cloudinary API is not currently available due to limitations in Payload CMS v3's custom field component system. Users can still manually type folder paths when `enableDynamicFolders` is enabled.

We are monitoring Payload CMS updates and will re-implement this feature once the framework provides the necessary hooks for proper form integration.
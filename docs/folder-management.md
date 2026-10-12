# Cloudinary Folder Management

Organize your uploads into folders with flexible configuration options and smart asset management.

## Overview

The folder management feature provides:
- **Static folders** - Set a fixed folder for all uploads
- **Dynamic folders** - Let users specify folders during upload
- **Smart asset moving** - Move files between folders without re-uploading
- **Custom field names** - Use your own field name for folder selection
- **Automatic folder creation** - Folders are created automatically in Cloudinary
- **Folder validation** - Automatic cleanup of invalid characters and paths

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

This adds a text field where users can type folder paths like:
- `products/electronics`
- `blog/2024/july`
- `team/marketing`

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
        placeholder: 'uploads',
      },
      validate: (value) => {
        if (value && !value.match(/^[a-zA-Z0-9\/_-]+$/)) {
          return 'Folder name can only contain letters, numbers, hyphens, underscores, and slashes'
        }
        return true
      },
    },
  ],
}
```

## Smart Asset Moving

When you change the folder path for an existing file, the plugin automatically:

1. **Uses Cloudinary's rename API** to move the asset, from its stored delivery type, so private (`authenticated`) files move too
2. **Keeps the file name part of the public ID** and the version
3. **Updates folder location** without re-uploading
4. **Maintains all transformations**. The asset gets a new public ID, so URLs to the old location stop working
5. **Updates stored URLs** of a public file to reflect the new location. A private file stores no delivery URL: its URLs are built when the document is read
6. **Moves the asset back** when the save fails on a REST request. See [Handling Updates](./handling-updates.md#when-a-save-fails)

This means you can reorganize your files without losing any data or creating duplicates.

## How It Works

1. **Static Mode**: All files uploaded to the configured folder
2. **Dynamic Mode**: Users enter folder path in a text field
3. **Auto-Creation**: Folders are created automatically on first upload
4. **Path Cleaning**: Leading/trailing slashes are removed automatically
5. **Validation**: Invalid characters are filtered out
6. **Asset Moving**: Existing files are moved when folder changes

## Examples

### User Input → Cloudinary Folder
- `products` → `products/`
- `products/2024` → `products/2024/`
- `/products/` → `products/` (cleaned)
- `products/2024/summer` → `products/2024/summer/`
- `` (empty) → uses default or root folder
- `products with spaces!` → `products_with_spaces` (cleaned)

### Moving Assets
1. Upload file to `uploads/temp/`
2. Change folder to `products/2024/`
3. Plugin moves asset in Cloudinary
4. All URLs remain functional
5. Asset appears in new folder

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
   - Use hyphens or underscores: `product-images` or `product_images`
   - Be descriptive: `blog-posts/2024` not `bp/24`
   - Avoid special characters: `!@#$%^&*()` will be cleaned

3. **Organization Tips**:
   - By date: `media/2024/01`
   - By type: `images/banners`
   - By feature: `products/thumbnails`
   - By project: `clients/acme-corp`

4. **Moving Strategy**:
   - Use folder changes instead of re-uploading
   - Plan folder structure before uploading many files
   - Test folder moves with a few files first
   - Consider URL implications when moving public files

## Folder Validation

The plugin automatically cleans folder paths:

| Input | Output | Reason |
|-------|--------|---------|
| `/uploads/` | `uploads` | Removes leading/trailing slashes |
| `products with spaces` | `products_with_spaces` | Replaces spaces with underscores |
| `products!!` | `products` | Removes special characters |
| `PRODUCTS` | `PRODUCTS` | Preserves case (case-sensitive) |
| `products//2024` | `products/2024` | Removes duplicate slashes |

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
  storage: [
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

## Technical Details

### Folder Creation
- Folders are created automatically on first upload
- No need to pre-create folders in Cloudinary
- Nested folders are created as needed

### Asset Moving
- Uses Cloudinary's `rename` API internally, with the asset's stored delivery type
- Preserves all metadata and transformations
- Updates a public file's stored URLs automatically, and stores none for a private file
- Maintains version history

### Validation
- Removes invalid characters automatically
- Normalizes path separators
- Prevents empty or invalid folder names
- Provides helpful error messages

## Notes

- Cloudinary automatically creates folders on first upload
- Folders cannot be deleted via this plugin (use Cloudinary dashboard)
- Empty folders don't appear in Cloudinary until they contain files
- Folder names are case-sensitive in Cloudinary
- Use forward slashes (/) for folder hierarchy
- Moving assets preserves all existing URLs and transformations
- The plugin handles all folder validation and cleanup automatically
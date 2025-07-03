# Dynamic Folder Selection

The Cloudinary storage plugin supports multiple ways to organize your uploads into folders.

## Static Folders

The simplest approach is to specify a static folder in your configuration:

```typescript
cloudinaryStorage({
  collections: {
    media: {
      folder: 'website/uploads',
    },
  },
})
```

## Dynamic Folders with Functions

You can use a function to dynamically determine the folder based on various factors:

### Date-based Folders

```typescript
cloudinaryStorage({
  collections: {
    media: {
      folder: () => {
        const date = new Date()
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        return `uploads/${year}/${month}`
      },
    },
  },
})
```

This creates folders like: `uploads/2024/07/`

### User-based Folders

```typescript
cloudinaryStorage({
  collections: {
    media: {
      folder: (data) => {
        // Assuming user info is passed in data
        const userId = data.userId || 'anonymous'
        return `users/${userId}/uploads`
      },
    },
  },
})
```

## User-Selectable Folders

Allow users to choose the folder when uploading:

```typescript
cloudinaryStorage({
  collections: {
    media: {
      enableDynamicFolders: true,
      folder: 'uploads', // Default folder
      folderField: 'cloudinaryFolder', // Field name for folder selection
    },
  },
})
```

This adds a "Cloudinary Folder" field to the upload form where users can specify:
- `products/electronics`
- `blog/2024/july`
- `team/marketing`

## Folder Templates with Variables

You can combine static and dynamic parts:

```typescript
cloudinaryStorage({
  collections: {
    media: {
      enableDynamicFolders: true,
      folder: (data) => {
        const base = data.cloudinaryFolder || 'uploads'
        const date = new Date()
        const year = date.getFullYear()
        return `${base}/${year}`
      },
    },
  },
})
```

If a user enters `products` in the folder field, files will be uploaded to `products/2024/`.

## Access Control

You can implement folder-based access control:

```typescript
cloudinaryStorage({
  collections: {
    media: {
      folder: (data) => {
        // Different folders based on user role
        if (data.userRole === 'admin') {
          return 'admin/uploads'
        } else if (data.userRole === 'editor') {
          return 'content/uploads'
        }
        return 'public/uploads'
      },
    },
  },
})
```

## Best Practices

1. **Consistent Structure**: Use a consistent folder naming convention
2. **Avoid Special Characters**: Stick to alphanumeric characters, hyphens, and underscores
3. **Limit Depth**: Don't create overly deep folder structures
4. **Consider Performance**: Cloudinary performs better with a balanced folder structure

## Folder Permissions

When using dynamic folders, ensure your Cloudinary API credentials have permission to create and upload to the specified folders. You can manage folder permissions in your Cloudinary dashboard under Settings > Security.
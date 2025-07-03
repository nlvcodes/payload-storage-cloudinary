# Dynamic Folders

Allow users to organize uploads by specifying folder paths during upload.

## Overview

Dynamic folders let users choose where files are stored in Cloudinary by entering a folder path in the upload form.

## Configuration

### Basic Setup

```typescript
cloudinaryStorage({
  collections: {
    media: {
      folder: {
        path: 'uploads', // Default folder
        enableDynamic: true, // Enable folder input
      },
    },
  },
})
```

### Custom Field Name

```typescript
collections: {
  media: {
    folder: {
      path: 'uploads',
      enableDynamic: true,
      fieldName: 'customFolderField', // Use custom field name
    },
  },
}
```

### Built-in Folder Selection

Enable dropdown folder selection with existing Cloudinary folders:

```typescript
cloudinaryStorage({
  collections: {
    media: {
      folder: {
        path: 'uploads',
        enableDynamic: true,
        useFolderSelect: true, // Enable dropdown selection
      },
    },
  },
})
```

This provides:
- Dropdown list of existing Cloudinary folders
- Option to create new folders
- Automatic folder fetching from Cloudinary

**Note:** There is a known issue where the selected folder value doesn't immediately trigger the save button. Users need to make another change to the document after selecting a folder.

## User-Selectable Folders

Allow users to choose the folder when uploading:

```typescript
cloudinaryStorage({
  collections: {
    media: {
      folder: {
        path: 'uploads', // Default folder
        enableDynamic: true, // Enable folder selection
        fieldName: 'cloudinaryFolder', // Field name (optional, defaults to 'cloudinaryFolder')
      },
    },
  },
})
```

This adds a "Cloudinary Folder" field to the upload form where users can specify:
- `products/electronics`
- `blog/2024/july`
- `team/marketing`

### Custom Field Implementation

If you need more control over the folder field (e.g., custom UI component, validation, or dropdown selector), you can prevent the plugin from creating the field automatically:

```typescript
cloudinaryStorage({
  collections: {
    media: {
      folder: {
        path: 'uploads',
        enableDynamic: true,
        fieldName: 'cloudinaryFolder',
        skipFieldCreation: true, // Prevent automatic field creation
      },
    },
  },
})
```

Then add your own field to the collection:

```typescript
const Media: CollectionConfig = {
  slug: 'media',
  upload: {
    disableLocalStorage: true,
  },
  fields: [
    {
      name: 'cloudinaryFolder',
      type: 'text',
      label: 'Upload Folder',
      defaultValue: 'uploads',
      admin: {
        description: 'Choose the folder for this upload',
        // Add custom component if needed
        components: {
          Field: MyCustomFolderSelector,
        },
      },
      // Add validation if needed
      validate: (value) => {
        if (value && !value.match(/^[a-zA-Z0-9\/_-]+$/)) {
          return 'Folder name can only contain letters, numbers, hyphens, underscores, and slashes'
        }
        return true
      },
    },
    // ... other fields
  ],
}
```

The plugin will still use the field value during upload, but you have complete control over the field's behavior and appearance.

## Organizing Folders

### By Date

While function-based folder configuration is not currently supported, you can achieve date-based organization by:

1. Using the folder input to manually specify dates: `uploads/2024/07`
2. Creating different collections for different time periods
3. Using a custom field component (see [Custom Folder Field Example](./custom-folder-field-example.md))

### By User or Role

For user-based organization:

1. Use the folder input to manually specify user folders: `users/john-doe`
2. Create separate collections with different default folders per role
3. Implement a custom field component with user-aware logic

## Best Practices

1. **Consistent Structure**: Use a consistent folder naming convention
2. **Avoid Special Characters**: Stick to alphanumeric characters, hyphens, and underscores
3. **Limit Depth**: Don't create overly deep folder structures (max 3-4 levels)
4. **Consider Performance**: Cloudinary performs better with a balanced folder structure
5. **Plan Ahead**: Design your folder structure before uploading many files

## Common Folder Structures

```
# By content type
media/
├── images/
│   ├── products/
│   ├── blog/
│   └── users/
├── videos/
│   ├── tutorials/
│   └── marketing/
└── documents/

# By date
uploads/
├── 2024/
│   ├── 01-january/
│   ├── 02-february/
│   └── ...
└── 2025/

# By project/client
clients/
├── acme-corp/
│   ├── assets/
│   └── documents/
└── xyz-inc/
```

## Folder Permissions

When using dynamic folders, ensure your Cloudinary API credentials have permission to create and upload to the specified folders. You can manage folder permissions in your Cloudinary dashboard under Settings > Security.
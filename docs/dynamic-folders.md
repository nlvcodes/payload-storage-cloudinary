# Dynamic Folders

Allow users to organize uploads by specifying folder paths during upload.

## Overview

Dynamic folders let users choose where files are stored in Cloudinary by entering a folder path in the upload form. This feature also includes **smart asset moving** - when you change the folder path, the plugin moves the existing asset in Cloudinary instead of creating a duplicate.

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

## User-Specified Folders

Allow users to type the folder path when uploading:

```typescript
cloudinaryStorage({
  collections: {
    media: {
      folder: {
        path: 'uploads', // Default folder
        enableDynamic: true, // Enable folder input
        fieldName: 'cloudinaryFolder', // Field name (optional, defaults to 'cloudinaryFolder')
      },
    },
  },
})
```

This adds a "Cloudinary Folder" text field to the upload form where users can specify folder paths like:
- `products/electronics`
- `blog/2024/july`
- `team/marketing`

### Smart Asset Moving

When you change the folder path for an existing file, the plugin:
1. Uses Cloudinary's rename API to move the asset, from its stored delivery type, so private (`authenticated`) files move too
2. Keeps the file name part of the public ID, and the version
3. Updates the folder location without re-uploading
4. Maintains all transformations. The asset gets a new public ID, so URLs to the old location stop working
5. Stores no delivery URL for a private file: its URLs are built when the document is read. A public file's stored URLs point at the new location

The move happens before the save, except when the same save makes a private file public: then one rename after the save moves and publishes the file. If the save fails, the plugin moves the asset back on a REST request. See [Handling Updates](./handling-updates.md#when-a-save-fails).

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
        description: 'Choose the folder for this upload (e.g., products/2024)',
        placeholder: 'uploads',
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

Create date-based organization by using the folder input to specify dates:

```
uploads/2024/07/
uploads/2024/08/
uploads/2025/01/
```

### By Content Type

Organize by the type of content:

```
images/products/
images/blog/
videos/tutorials/
documents/contracts/
```

### By User or Role

For user-based organization:

```
users/john-doe/
users/jane-smith/
teams/marketing/
teams/development/
```

## Best Practices

1. **Consistent Structure**: Use a consistent folder naming convention
2. **Avoid Special Characters**: Stick to alphanumeric characters, hyphens, and underscores
3. **Limit Depth**: Don't create overly deep folder structures (max 3-4 levels)
4. **Consider Performance**: Cloudinary performs better with a balanced folder structure
5. **Plan Ahead**: Design your folder structure before uploading many files
6. **Use Smart Moving**: Change folder paths instead of re-uploading files to new locations

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
    ├── branding/
    └── products/

# Hybrid approach
content/
├── 2024/
│   ├── products/
│   ├── blog/
│   └── marketing/
└── 2025/
    ├── products/
    └── blog/
```

## Technical Details

### Folder Creation
- Folders are automatically created in Cloudinary when files are uploaded
- No need to pre-create folders in the Cloudinary dashboard
- The plugin handles folder creation seamlessly

### Asset Moving
- Uses Cloudinary's `rename` API to move assets between folders, with the asset's stored delivery type
- Keeps the file name part of the public ID, and the version
- URLs to the old location stop working, and the plugin stores the new public ID. A private file stores no delivery URL
- Transformation URLs are automatically updated

### Validation
- Folder names are cleaned to remove invalid characters
- Leading and trailing slashes are automatically removed
- Empty folder names default to the configured default folder

## Folder Permissions

When using dynamic folders, ensure your Cloudinary API credentials have permission to create and upload to the specified folders. You can manage folder permissions in your Cloudinary dashboard under Settings > Security.
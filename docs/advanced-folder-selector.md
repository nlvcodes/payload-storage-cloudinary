# Advanced Folder Selector

By default, the dynamic folder feature provides a simple text field where users can type folder paths. However, if you want a dropdown selector that fetches folders from your Cloudinary account, you can implement it manually in your collection.

## Implementation

### 1. Configure the plugin to skip field creation

```typescript
cloudinaryStorage({
  collections: {
    media: {
      folder: {
        path: 'uploads',
        enableDynamic: true,
        skipFieldCreation: true, // Prevent automatic field creation
      },
    },
  },
})
```

### 2. Import the FolderSelector component

```typescript
import { FolderSelector } from 'payload-storage-cloudinary/client'
```

### 3. Add it to your collection's fields

```typescript
const Media: CollectionConfig = {
  slug: 'media',
  upload: {
    disableLocalStorage: true,
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
    },
    // Add your own cloudinaryFolder field
    {
      name: 'cloudinaryFolder',
      type: 'text',
      label: 'Cloudinary Folder',
      admin: {
        components: {
          Field: FolderSelector,
        },
      },
    },
  ],
}
```

### 3. Pass Cloudinary credentials

The FolderSelector needs access to your Cloudinary credentials. You can either:

#### Option A: Hardcode credentials (for testing only)
Modify the FolderSelector component in your local code to include your credentials.

#### Option B: Create a wrapper component
```typescript
'use client'

import { FolderSelector } from 'payload-storage-cloudinary/client'
import React from 'react'

export const MyFolderSelector = (props) => {
  // Pass your credentials from environment variables or config
  return <FolderSelector {...props} cloudConfig={{
    cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
    api_key: process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY,
    api_secret: process.env.NEXT_PUBLIC_CLOUDINARY_API_SECRET,
  }} />
}
```

Then use `MyFolderSelector` in your collection fields.

## API Endpoint

The FolderSelector uses the `/api/cloudinary/folders` endpoint provided by the plugin to fetch folders from Cloudinary. This endpoint is automatically registered when you use the plugin.

## Limitations

- The FolderSelector requires client-side access to Cloudinary credentials
- Changes to the folder selection may not immediately activate the save button due to form state integration limitations
- The component works best when implemented directly in your collection rather than through the plugin

## Default Behavior

If you don't implement the custom FolderSelector, the plugin provides a standard text field where users can type folder paths like:
- `products/2024`
- `users/avatars`
- `documents/pdfs`

Folders are automatically created in Cloudinary if they don't exist during upload.
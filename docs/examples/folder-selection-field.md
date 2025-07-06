# Custom Folder Selection Field Example

This example shows how to implement a custom folder selection field that allows users to either select from existing Cloudinary folders or create new ones.

## Implementation

### 1. Create the Server Component (`field.tsx`)

```typescript
import { v2 as cloudinary } from 'cloudinary'
import { FieldClient } from './field.client'

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
    api_key: process.env.CLOUDINARY_API_KEY!,
    api_secret: process.env.CLOUDINARY_API_SECRET!,
})

async function getAllCloudinaryFolders() {
    try {
        const result = await cloudinary.api.root_folders()
        return result.folders
    } catch (error) {
        console.error(error)
        throw error
    }
}

async function getSubfolders(folderPath: string) {
    try {
        const result = await cloudinary.api.sub_folders(folderPath)
        return result.folders
    } catch (error) {
        console.error(error)
        throw error
    }
}

async function getAllFoldersRecursively(path: string = '', depth: number = 0): Promise<any[]> {
    const allFolders = []
    
    try {
        const folders = path === '' 
            ? await getAllCloudinaryFolders()
            : await getSubfolders(path)

        for (const folder of folders) {
            const indent = '  '.repeat(depth)
            const icon = depth > 0 ? '└─ ' : ''

            const displayName = depth > 0 ? folder.path : folder.name
            
            allFolders.push({
                label: `${indent}${icon}${displayName}`,
                value: folder.path,
            })

            const subfolders = await getAllFoldersRecursively(folder.path, depth + 1)
            allFolders.push(...subfolders)
        }
    } catch (error) {
        console.error(`Error fetching folders for path "${path}":`, error)
    }
    
    return allFolders
}

export async function selectField() {
    const rootFolder = {
        label: '/ (root)',
        value: ''
    }
    
    const folders = [rootFolder, ...(await getAllFoldersRecursively())]
    return <FieldClient folders={folders} />
}
```

### 2. Create the Client Component (`field.client.tsx`)

```typescript
'use client'
import { FieldLabel, SelectInput, TextInput, useField } from "@payloadcms/ui";
import { OptionObject } from "payload";
import { useState } from "react";

export const FieldClient = ({ folders }: { folders: OptionObject[] }) => {
    const { path, setValue, value } = useField();
    const [folderMode, setFolderMode] = useState<'existing' | 'new'>('existing');
    
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <FieldLabel label={path}/>
            
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.5rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                        type="radio"
                        name={`${path}_mode`}
                        value="existing"
                        checked={folderMode === 'existing'}
                        onChange={() => setFolderMode('existing')}
                    />
                    Select existing folder
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                        type="radio"
                        name={`${path}_mode`}
                        value="new"
                        checked={folderMode === 'new'}
                        onChange={() => setFolderMode('new')}
                    />
                    Create new folder
                </label>
            </div>
            
            {folderMode === 'existing' ? (
                <SelectInput
                    path={path}
                    name={path}
                    value={value as string}
                    options={folders}
                    onChange={(e: any) => setValue(e.value)}
                />
            ) : (
                <TextInput
                    path={path}
                    value={value as string}
                    placeholder="Enter folder path (e.g., products/2024)"
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setValue(e.target.value)}
                />
            )}
        </div>
    );
}
```

### 3. Use in Your Collection

```typescript
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
        {
            name: 'cloudinaryFolder',
            type: 'text',
            admin: {
                components: {
                    Field: '/src/components/field.tsx#selectField'
                }
            }
        }
    ],
}
```

## Using the Helper Function

Alternatively, you can use the `getCloudinaryFolders` helper provided by the plugin:

```typescript
import { getCloudinaryFolders } from 'payload-storage-cloudinary'

// In your custom field component
export async function MyCustomField() {
    const folders = await getCloudinaryFolders()
    // Use folders in your component
}
```

## Notes

- The folder list is cached for 5 minutes to reduce API calls
- Folders are displayed hierarchically with visual indicators
- Users can switch between selecting existing folders and creating new ones
- The field value is stored as the folder path string
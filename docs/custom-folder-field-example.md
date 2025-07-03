# Custom Cloudinary Folder Field Example

This document provides a complete example of implementing a custom folder selection field for Cloudinary uploads in Payload CMS.

## Overview

The custom folder field provides:
- Dropdown list of existing Cloudinary folders
- Text input for creating new folder paths
- Secure server-side API for fetching folders
- Professional styling that matches Payload's UI

**Note:** The radio toggle implementation shown in this example is optional. The plugin now includes built-in dynamic folder selection with `useFolderSelect: true`.

## Implementation

### 1. Configure the Plugin

First, configure the plugin to skip creating its own field:

```typescript
// payload.config.ts
import { cloudinaryStorage } from 'payload-storage-cloudinary'

export default buildConfig({
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
            fieldName: 'cloudinaryFolder',
            skipFieldCreation: true, // Important!
          },
        },
      },
    }),
  ],
})
```

### 2. Add the Custom Field to Your Collection

```typescript
// In your collection configuration
{
  slug: 'media',
  upload: {
    disableLocalStorage: true,
  },
  fields: [
    {
      name: 'cloudinaryFolder',
      type: 'text',
      label: 'Cloudinary Folder',
      defaultValue: 'uploads',
      admin: {
        description: 'Select or create a folder in Cloudinary',
        components: {
          Field: CloudinaryFolderField,
        },
      },
    },
  ],
}
```

### 3. Create the API Endpoint

Create a secure server-side endpoint to fetch Cloudinary folders:

```typescript
// app/api/cloudinary/folders/route.ts (Next.js App Router)
// Or create an equivalent endpoint in your framework
import { NextRequest, NextResponse } from 'next/server'
import { v2 as cloudinary } from 'cloudinary'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

export async function POST(request: NextRequest) {
  try {
    const folders: string[] = []
    
    try {
      // Try Admin API first
      const adminResult = await cloudinary.api.root_folders()
      
      // Recursively fetch sub-folders
      const fetchSubFolders = async (path: string) => {
        try {
          const subResult = await cloudinary.api.sub_folders(path)
          
          if (subResult.folders && Array.isArray(subResult.folders)) {
            for (const folder of subResult.folders) {
              const fullPath = `${path}/${folder.name}`
              folders.push(fullPath)
              await fetchSubFolders(fullPath)
            }
          }
        } catch (error) {
          console.error(`Error fetching sub-folders for ${path}:`, error)
        }
      }
      
      if (adminResult.folders && Array.isArray(adminResult.folders)) {
        for (const folder of adminResult.folders) {
          folders.push(folder.name)
          await fetchSubFolders(folder.name)
        }
      }
    } catch (adminError) {
      // Fall back to Search API if Admin API fails
      const searchResult = await cloudinary.search
        .expression('folder:*')
        .max_results(500)
        .execute()
        
      if (searchResult.resources) {
        const folderSet = new Set<string>()
        
        searchResult.resources.forEach((resource: any) => {
          if (resource.folder) {
            folderSet.add(resource.folder)
            
            // Add parent folders
            const parts = resource.folder.split('/')
            for (let i = 1; i <= parts.length; i++) {
              folderSet.add(parts.slice(0, i).join('/'))
            }
          }
        })
        
        folders.push(...Array.from(folderSet))
      }
    }
    
    // Sort folders alphabetically
    folders.sort()
    
    return NextResponse.json({ folders })
  } catch (error) {
    console.error('Error fetching Cloudinary folders:', error)
    return NextResponse.json(
      { error: 'Failed to fetch folders' },
      { status: 500 }
    )
  }
}
```

### 4. Create the Custom Field Component

```typescript
// src/components/CloudinaryFolderField/index.tsx
'use client'

import React, { useState, useEffect } from 'react'
import type { TextFieldClientProps } from 'payload'
import { useField } from '@payloadcms/ui'
import './styles.css'

export const CloudinaryFolderField: React.FC<TextFieldClientProps> = (props) => {
  const { value = '', setValue, showError, errorMessage } = useField({ path: props.path })
  const [folders, setFolders] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'select' | 'custom'>('select')
  const [customValue, setCustomValue] = useState('')

  useEffect(() => {
    const fetchFolders = async () => {
      try {
        const response = await fetch('/api/cloudinary/folders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
        
        if (response.ok) {
          const data = await response.json()
          setFolders(data.folders || [])
        } else {
          setError('Failed to load folders')
        }
      } catch (error) {
        setError('Error loading folders')
      } finally {
        setLoading(false)
      }
    }
    
    fetchFolders()
  }, [])

  useEffect(() => {
    // If current value is not in the folders list, switch to custom mode
    if (value && folders.length > 0 && !folders.includes(value as string)) {
      setMode('custom')
      setCustomValue(value as string)
    }
  }, [value, folders])

  const handleModeChange = (newMode: 'select' | 'custom') => {
    setMode(newMode)
    if (newMode === 'select') {
      setValue(folders[0] || '')
    } else {
      setValue(customValue)
    }
  }

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setValue(e.target.value)
  }

  const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCustomValue(e.target.value)
    setValue(e.target.value)
  }

  if (loading) {
    return (
      <div className="cloudinary-folder-field">
        <div className="field-loading">Loading folders...</div>
      </div>
    )
  }

  return (
    <div className="cloudinary-folder-field">
      <div className="field-header">
        <label className="field-label">
          Cloudinary Folder
          {props.field?.required && <span className="required">*</span>}
        </label>
      </div>

      <div className="mode-selector">
        <label className="mode-option">
          <input
            type="radio"
            name={`${props.path}-mode`}
            checked={mode === 'select'}
            onChange={() => handleModeChange('select')}
          />
          <span>Select existing folder</span>
        </label>
        <label className="mode-option">
          <input
            type="radio"
            name={`${props.path}-mode`}
            checked={mode === 'custom'}
            onChange={() => handleModeChange('custom')}
          />
          <span>Create new folder</span>
        </label>
      </div>

      {mode === 'select' ? (
        <select
          value={value as string}
          onChange={handleSelectChange}
          className="field-select"
        >
          <option value="">Default (uploads)</option>
          {folders.map(folder => (
            <option key={folder} value={folder}>
              {folder}
            </option>
          ))}
        </select>
      ) : (
        <input
          type="text"
          value={customValue}
          onChange={handleCustomChange}
          placeholder="e.g., products/2024"
          className="field-input"
        />
      )}

      {showError && errorMessage && (
        <div className="field-error-message">{errorMessage}</div>
      )}
    </div>
  )
}
```

### 5. Add Styles

Create a CSS file to style the component:

```css
/* src/components/CloudinaryFolderField/styles.css */
.cloudinary-folder-field {
  width: 100%;
}

.field-header {
  margin-bottom: 0.5rem;
}

.field-label {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--theme-text);
  display: block;
  margin-bottom: 0.25rem;
}

.field-label .required {
  color: var(--theme-error-500);
  margin-left: 0.25rem;
}

.field-loading,
.field-error {
  padding: 0.75rem;
  border-radius: 0.25rem;
  margin-bottom: 0.5rem;
}

.field-loading {
  background-color: var(--theme-elevation-50);
  color: var(--theme-text-light);
}

.field-error {
  background-color: var(--theme-error-50);
  color: var(--theme-error-500);
  border: 1px solid var(--theme-error-200);
}

.mode-selector {
  display: flex;
  gap: 1.5rem;
  margin-bottom: 0.75rem;
  padding: 0.75rem;
  background-color: var(--theme-elevation-50);
  border-radius: 0.25rem;
}

.mode-option {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  font-size: 0.875rem;
  color: var(--theme-text);
}

.field-select,
.field-input {
  width: 100%;
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  border: 1px solid var(--theme-elevation-200);
  border-radius: 0.25rem;
  background-color: var(--theme-input-bg);
  color: var(--theme-text);
  transition: border-color 0.2s;
}

.field-select:focus,
.field-input:focus {
  outline: none;
  border-color: var(--theme-blue-500);
  box-shadow: 0 0 0 2px var(--theme-blue-100);
}

.field-description {
  margin-top: 0.5rem;
  font-size: 0.75rem;
  color: var(--theme-text-light);
}

.field-error-message {
  margin-top: 0.5rem;
  font-size: 0.75rem;
  color: var(--theme-error-500);
}

/* Dark mode support */
@media (prefers-color-scheme: dark) {
  .field-loading,
  .mode-selector {
    background-color: var(--theme-elevation-100);
  }
  
  .field-select,
  .field-input {
    background-color: var(--theme-elevation-0);
    border-color: var(--theme-elevation-300);
  }
}
```

## Features

1. **Loading State**: Shows a loading indicator while fetching folders
2. **Error Handling**: Gracefully handles API errors with fallback to manual input
3. **Responsive Design**: Works well on all screen sizes
4. **Dark Mode Support**: Automatically adapts to Payload's dark mode
5. **Accessibility**: Proper labels and keyboard navigation

## Alternative: Built-in Dynamic Folder Selection

Instead of implementing a custom field component, you can use the plugin's built-in dynamic folder selection:

```typescript
cloudinaryStorage({
  collections: {
    media: {
      folder: {
        path: 'uploads',
        enableDynamic: true,
        useFolderSelect: true, // Enable dropdown folder selection
      },
    },
  },
})
```

This provides similar functionality without needing custom components.

## Security Considerations

- API credentials are never exposed to the client
- The `/api/cloudinary/folders` endpoint should ideally include authentication checks
- Consider rate limiting the API endpoint in production

## Testing

To test the implementation:

1. Start your development server
2. Navigate to the admin panel
3. Create or edit a media item
4. You should see the custom folder field with:
   - Radio buttons to switch modes
   - Dropdown of existing folders (when available)
   - Text input for custom folder paths

The selected folder will be used when uploading files to Cloudinary.
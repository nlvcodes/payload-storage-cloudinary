import type { CollectionConfig } from 'payload'
import { cloudinaryStorage } from 'payload-storage-cloudinary'

// Example 1: Custom folder field with validation
export const MediaWithCustomFolder: CollectionConfig = {
  slug: 'media',
  upload: {
    disableLocalStorage: true,
  },
  fields: [
    {
      name: 'cloudinaryFolder',
      type: 'text',
      label: 'Upload Folder',
      defaultValue: 'uploads/general',
      required: true,
      admin: {
        description: 'Organize your uploads by choosing a folder path',
        placeholder: 'e.g., products/2024 or marketing/campaigns',
      },
      validate: (value) => {
        if (!value) return 'Folder is required'
        
        // Validate folder format
        if (!value.match(/^[a-zA-Z0-9\/_-]+$/)) {
          return 'Folder can only contain letters, numbers, hyphens, underscores, and slashes'
        }
        
        // Validate folder depth
        const depth = value.split('/').length
        if (depth > 5) {
          return 'Folder path is too deep (max 5 levels)'
        }
        
        return true
      },
    },
    {
      name: 'alt',
      type: 'text',
      label: 'Alt Text',
    },
  ],
}

// Example 2: Folder field with select dropdown
export const MediaWithFolderDropdown: CollectionConfig = {
  slug: 'media',
  upload: {
    disableLocalStorage: true,
  },
  fields: [
    {
      name: 'cloudinaryFolder',
      type: 'select',
      label: 'Upload Folder',
      defaultValue: 'uploads',
      required: true,
      options: [
        { label: 'General Uploads', value: 'uploads' },
        { label: 'Product Images', value: 'products' },
        { label: 'Blog Images', value: 'blog' },
        { label: 'User Avatars', value: 'users/avatars' },
        { label: 'Marketing Assets', value: 'marketing' },
        { label: 'Documentation', value: 'docs' },
      ],
      admin: {
        description: 'Choose a predefined folder for this upload',
      },
    },
    {
      name: 'alt',
      type: 'text',
      label: 'Alt Text',
    },
  ],
}

// Example 3: Dynamic folder based on other fields
export const MediaWithConditionalFolder: CollectionConfig = {
  slug: 'media',
  upload: {
    disableLocalStorage: true,
  },
  fields: [
    {
      name: 'category',
      type: 'select',
      label: 'Category',
      required: true,
      options: [
        { label: 'Product', value: 'product' },
        { label: 'Blog', value: 'blog' },
        { label: 'Team', value: 'team' },
      ],
    },
    {
      name: 'cloudinaryFolder',
      type: 'text',
      label: 'Upload Folder',
      admin: {
        condition: (data) => !!data.category,
        description: 'Folder is automatically set based on category',
        readOnly: true,
      },
      hooks: {
        beforeChange: [
          ({ data, value }) => {
            // Automatically set folder based on category
            if (data?.category) {
              const year = new Date().getFullYear()
              return `${data.category}/${year}`
            }
            return value || 'uploads'
          },
        ],
      },
    },
    {
      name: 'alt',
      type: 'text',
      label: 'Alt Text',
    },
  ],
}

// Plugin configuration that works with all the above examples
export const storageConfig = cloudinaryStorage({
  cloudConfig: {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
    api_key: process.env.CLOUDINARY_API_KEY!,
    api_secret: process.env.CLOUDINARY_API_SECRET!,
  },
  collections: {
    media: {
      folder: {
        path: 'uploads', // Default if no folder specified
        enableDynamic: true,
        skipFieldCreation: true, // Important: prevents duplicate field error
      },
    },
  },
})

// Example 4: Custom React component for folder selection
export const FolderFieldComponent = `
import React, { useState } from 'react'
import { useField } from 'payload/components/forms'

export const CustomFolderSelector: React.FC = () => {
  const { value, setValue } = useField({ path: 'cloudinaryFolder' })
  const [showCustom, setShowCustom] = useState(false)
  
  const presetFolders = [
    'uploads/general',
    'products/images',
    'marketing/campaigns',
    'blog/featured',
  ]
  
  return (
    <div>
      <label>
        <input
          type="radio"
          checked={!showCustom}
          onChange={() => setShowCustom(false)}
        />
        Select preset folder
      </label>
      
      {!showCustom && (
        <select
          value={value || ''}
          onChange={(e) => setValue(e.target.value)}
        >
          <option value="">Choose a folder...</option>
          {presetFolders.map(folder => (
            <option key={folder} value={folder}>
              {folder}
            </option>
          ))}
        </select>
      )}
      
      <label>
        <input
          type="radio"
          checked={showCustom}
          onChange={() => setShowCustom(true)}
        />
        Enter custom folder
      </label>
      
      {showCustom && (
        <input
          type="text"
          value={value || ''}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g., special/project/2024"
        />
      )}
    </div>
  )
}
`
'use client'

import React, { useEffect, useRef, useState } from 'react'
import type { TextFieldClientComponent } from 'payload'
import { SelectInput, FieldLabel } from '@payloadcms/ui'
import { useCloudinaryFolders } from '../../providers/CloudinaryFolderProvider/index.js'

export const FolderSelector: TextFieldClientComponent = ({ 
  field,
  readOnly,
  ...props
}) => {
  const { folders, loading, error, fetchFolders, selectedFolder, setSelectedFolder } = useCloudinaryFolders()
  const hasInitializedRef = useRef(false)
  const [folderMode, setFolderMode] = useState<'select' | 'create'>('select')
  const [newFolderPath, setNewFolderPath] = useState('')
  
  // Get Cloudinary config from clientProps
  const cloudConfig = (props as any)?.cloudConfig || {}

  // Get the initial value from field if available
  const fieldValue = (field as any)?.value || (field as any)?.defaultValue || ''

  useEffect(() => {
    if (!hasInitializedRef.current && fieldValue) {
      setSelectedFolder(fieldValue)
      // Check if the initial value exists in folders
      if (folders.length > 0 && !folders.find(f => f.value === fieldValue)) {
        setFolderMode('create')
        setNewFolderPath(fieldValue)
      }
      hasInitializedRef.current = true
    }
  }, [fieldValue, folders, setSelectedFolder])

  useEffect(() => {
    if (cloudConfig.cloud_name && cloudConfig.api_key && cloudConfig.api_secret) {
      fetchFolders(cloudConfig)
    }
  }, [cloudConfig.cloud_name, cloudConfig.api_key, cloudConfig.api_secret, fetchFolders])

  const handleModeChange = React.useCallback((value: string) => {
    setFolderMode(value as 'select' | 'create')
    if (value === 'select') {
      // Reset to first folder or empty
      setSelectedFolder(folders[0]?.value || '')
      setNewFolderPath('')
    } else {
      // Clear selection when switching to create mode
      setSelectedFolder(newFolderPath)
    }
  }, [folders, newFolderPath, setSelectedFolder])

  const handleSelectChange = React.useCallback((option: any) => {
    const newValue = (option && !Array.isArray(option)) ? String(option.value) : ''
    setSelectedFolder(newValue)
  }, [setSelectedFolder])

  const handleNewFolderChange = React.useCallback((value: string) => {
    setNewFolderPath(value)
    setSelectedFolder(value)
  }, [setSelectedFolder])

  const radioOptions = [
    {
      label: 'Select existing folder',
      value: 'select',
    },
    {
      label: 'Create new folder',
      value: 'create',
    },
  ]

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <FieldLabel
        label={field.label}
        required={field.required}
      />
      
      <div style={{ marginBottom: '1rem' }}>
        {radioOptions.map((option) => (
          <label key={option.value} style={{ marginRight: '1rem', cursor: 'pointer' }}>
            <input
              type="radio"
              name={`${field.name}-mode`}
              value={option.value}
              checked={folderMode === option.value}
              onChange={(e) => handleModeChange(e.target.value)}
              style={{ marginRight: '0.5rem' }}
            />
            {option.label}
          </label>
        ))}
      </div>

      {folderMode === 'select' ? (
        <>
          <SelectInput
            name={field.name || 'cloudinaryFolder'}
            path={field.name || 'cloudinaryFolder'}
            options={folders}
            value={selectedFolder || ''}
            onChange={handleSelectChange}
            isClearable
            readOnly={readOnly || loading}
            placeholder={loading ? 'Loading folders...' : 'Select a folder'}
          />
          {error && (
            <div style={{ 
              color: 'var(--color-error)', 
              marginTop: 'var(--base)', 
              fontSize: 'var(--font-size-small)' 
            }}>
              Note: Using default folders. {error}
            </div>
          )}
        </>
      ) : (
        <input
          type="text"
          value={newFolderPath}
          onChange={(e) => handleNewFolderChange(e.target.value)}
          placeholder="e.g., products/2024/images"
          readOnly={readOnly}
          style={{
            width: '100%',
            padding: '0.5rem',
            border: '1px solid var(--color-base-400)',
            borderRadius: '0.25rem',
            fontSize: 'var(--font-size-base)',
            backgroundColor: readOnly ? 'var(--color-base-100)' : 'var(--color-base-0)',
          }}
        />
      )}
      
      {folderMode === 'create' && (
        <div style={{ 
          marginTop: '0.5rem', 
          fontSize: 'var(--font-size-small)',
          color: 'var(--color-text-secondary)'
        }}>
          Enter a folder path. Folders will be created automatically on upload.
        </div>
      )}
    </div>
  )
}
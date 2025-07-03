'use client'

import type { TextFieldClientProps } from 'payload'

import { FieldLabel, SelectInput, useField } from '@payloadcms/ui'
import React, { useEffect, useRef, useState } from 'react'

import { useCloudinaryFolders } from '../../providers/CloudinaryFolderProvider/index.client.js'
import './index.scss'

const baseClass = 'cloudinaryFolderField'

type Props = {
  cloudConfig?: any
  collectionSlug?: string
} & TextFieldClientProps

export const FolderSelector = (props: Props) => {
  const { cloudConfig, field } = props
  const { setValue, value } = useField<string>({ path: field.name })
  const { folders, loading, error, fetchFolders } = useCloudinaryFolders()
  
  const hasInitializedRef = useRef(false)
  const [folderMode, setFolderMode] = useState<'select' | 'create'>('select')
  const [newFolderPath, setNewFolderPath] = useState('')
  
  useEffect(() => {
    if (!hasInitializedRef.current && value) {
      // Check if the initial value exists in folders
      if (folders.length > 0 && !folders.find(f => f.value === value)) {
        setFolderMode('create')
        setNewFolderPath(value)
      }
      hasInitializedRef.current = true
    }
  }, [value, folders])

  useEffect(() => {
    if (cloudConfig?.cloud_name && cloudConfig?.api_key && cloudConfig?.api_secret) {
      fetchFolders(cloudConfig)
    }
  }, [cloudConfig, fetchFolders])

  const handleModeChange = React.useCallback((modeValue: string) => {
    setFolderMode(modeValue as 'select' | 'create')
    if (modeValue === 'select') {
      const newValue = folders[0]?.value || ''
      setValue(newValue)
      setNewFolderPath('')
    } else {
      setValue(newFolderPath)
    }
  }, [folders, newFolderPath, setValue])

  const handleSelectChange = React.useCallback((option: any) => {
    const newValue = option?.value ? String(option.value) : ''
    setValue(newValue)
  }, [setValue])

  const handleNewFolderChange = React.useCallback((inputValue: string) => {
    setNewFolderPath(inputValue)
    setValue(inputValue)
  }, [setValue])

  return (
    <div className={baseClass}>
      <FieldLabel
        label={field.label}
        required={field.required}
      />
      
      <div className={`${baseClass}__mode-selector`}>
        {[
          { label: 'Select existing folder', value: 'select' },
          { label: 'Create new folder', value: 'create' },
        ].map((option) => (
          <label key={option.value} className={`${baseClass}__radio-label`}>
            <input
              type="radio"
              name={`${field.name}-mode`}
              value={option.value}
              checked={folderMode === option.value}
              onChange={(e) => handleModeChange(e.target.value)}
              className={`${baseClass}__radio-input`}
            />
            {option.label}
          </label>
        ))}
      </div>

      {folderMode === 'select' ? (
        <>
          <SelectInput
            name={field.name}
            path={field.name}
            options={folders}
            value={value || ''}
            onChange={handleSelectChange}
            isClearable
            readOnly={field.admin?.readOnly || loading}
            placeholder={loading ? 'Loading folders...' : 'Select a folder'}
          />
          {error && (
            <div className={`${baseClass}__error`}>
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
          readOnly={field.admin?.readOnly}
          className={`${baseClass}__text-input`}
        />
      )}
      
      {folderMode === 'create' && (
        <div className={`${baseClass}__help-text`}>
          Enter a folder path. Folders will be created automatically on upload.
        </div>
      )}
    </div>
  )
}
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

export const FolderSelector: React.FC = () => {
  const { value, setValue } = useField() || {value: "", setValue: () => {}}
  const [options, setOptions] = useState<Array<{ label: string; value: string }>>([])



  useEffect(() => {
    const fetchOptions = async () => {
      try {
        // The endpoint should use server-side credentials
        const response = await fetch(`${window.location.origin}/api/cloudinary/folders`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        })

        if (!response.ok) {
          throw new Error('Failed to fetch folders')
        }

        const data = await response.json()
        const folders = data.folders || []

        const folderOptions = folders.map((folder: any) => {
          return {
            label: folder.label || folder.name || folder.path || '/ (root)',
            value: folder.value !== undefined ? folder.value : (folder.path || folder.name || ''),
          }
        })
        setOptions(folderOptions)
      } catch (error) {
        console.error('Error fetching folders:', error)
        // Set some default options as fallback
        setOptions([
          { label: 'uploads', value: 'uploads' },
          { label: 'media', value: 'media' },
          { label: 'images', value: 'images' },
        ])
      }
    }
    fetchOptions()
  }, [])

  return (
    <SelectInput name={'folderSelect'} path={'folderSelect'} options={options} value={value as string} onChange={(e: any) => setValue(e.target.value)} />
  )
}
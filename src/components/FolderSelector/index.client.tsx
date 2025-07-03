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
  const [options, setOptions] = useState([])



  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const response = await fetch(`${window.location.origin}/api/cloudinary/folders`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            cloudName: "db4nqbopr",
            apiKey: '298568143978742',
            apiSecret: 'sx-vmPwIBjfvKWI8tdXXzhQLbO4',
          }),
        })

        const data = await response.json()

        const folderOptions = data.map((folder: any) => {
          return {
            label: folder.label || folder.name || folder.path || '/ (root)',
            value: folder.value !== undefined ? folder.value : (folder.path || folder.name || ''),
          }
        })
        setOptions(folderOptions)
      } catch {
        console.log('Error fetching folders')
      }
    }
  }, [])

  return (
    <SelectInput name={'folderSelect'} path={'folderSelect'} options={options} value={value as string} onChange={(e: any) => setValue(e.target.value)} />
  )
}
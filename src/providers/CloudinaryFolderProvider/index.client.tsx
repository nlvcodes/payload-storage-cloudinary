'use client'

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { OptionObject } from 'payload'

interface CloudinaryFolderContextType {
  folders: OptionObject[]
  loading: boolean
  error: string | null
  fetchFolders: (cloudConfig: any) => Promise<void>
}

const CloudinaryFolderContext = createContext<CloudinaryFolderContextType | undefined>(undefined)

export const CloudinaryFolderProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [folders, setFolders] = useState<OptionObject[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastConfig, setLastConfig] = useState<string>('')

  const fetchFolders = useCallback(async (cloudConfig: any) => {
    const configKey = JSON.stringify(cloudConfig)
    
    // Don't refetch if we already have folders for this config
    if (configKey === lastConfig && folders.length > 0) {
      return
    }

    try {
      setLoading(true)
      setError(null)

      const response = await fetch(`${window.location.origin}/api/cloudinary/folders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cloudName: cloudConfig.cloud_name,
          apiKey: cloudConfig.api_key,
          apiSecret: cloudConfig.api_secret,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to fetch folders')
      }

      const data = await response.json()
      console.log('Received folders data:', data)
      
      // Convert Cloudinary folders to OptionObject format
      const folderOptions: OptionObject[] = data.folders.map((folder: any) => ({
        label: folder.label || folder.name || folder.path || '/ (root)',
        value: folder.value !== undefined ? folder.value : (folder.path || folder.name || ''),
      }))

      // Add root option if not already present
      if (!folderOptions.find(opt => opt.value === '')) {
        folderOptions.unshift({
          label: '/ (root)',
          value: '',
        })
      }

      setFolders(folderOptions)
      setLastConfig(configKey)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch folders')
      console.error('Error fetching Cloudinary folders:', err)
      
      // Set default folders on error
      setFolders([
        { label: '/ (root)', value: '' },
        { label: 'uploads', value: 'uploads' },
        { label: 'media', value: 'media' },
        { label: 'documents', value: 'documents' },
      ])
    } finally {
      setLoading(false)
    }
  }, [folders.length, lastConfig])

  const value: CloudinaryFolderContextType = {
    folders,
    loading,
    error,
    fetchFolders,
  }

  return (
    <CloudinaryFolderContext.Provider value={value}>
      {children}
    </CloudinaryFolderContext.Provider>
  )
}

export const useCloudinaryFolders = () => {
  const context = useContext(CloudinaryFolderContext)
  if (!context) {
    throw new Error('useCloudinaryFolders must be used within a CloudinaryFolderProvider')
  }
  return context
}
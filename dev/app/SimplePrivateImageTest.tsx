'use client'

import React, { useState, useEffect } from 'react'
import { requiresSignedURL } from 'payload-storage-cloudinary/client'

export function SimplePrivateImageTest({ media }: { media: any }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const needsSignedUrl = requiresSignedURL(media)

  useEffect(() => {
    if (!media || !needsSignedUrl) {
      return
    }

    const fetchSignedUrl = async () => {
      setLoading(true)
      setError(null)
      
      try {
        const response = await fetch(`/api/media/signed-url/${media.id}`, {
          credentials: 'same-origin',
        })
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
          throw new Error(errorData.error || `HTTP ${response.status}`)
        }
        
        const data = await response.json()
        setSignedUrl(data.url)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch signed URL')
      } finally {
        setLoading(false)
      }
    }

    fetchSignedUrl()
  }, [media, needsSignedUrl])

  if (!media) return null

  return (
    <div className="border p-4 rounded">
      <h4 className="font-medium mb-2">Simple Private Image Test</h4>
      
      <div className="text-sm space-y-1 mb-4">
        <p>ID: {media.id}</p>
        <p>Filename: {media.filename}</p>
        <p>Is Private: {media.isPrivate ? 'Yes' : 'No'}</p>
        <p>Requires Signed URL: {media.requiresSignedURL ? 'Yes' : 'No'}</p>
        <p>Needs Signed URL (computed): {needsSignedUrl ? 'Yes' : 'No'}</p>
      </div>

      {needsSignedUrl ? (
        <>
          <p className="text-sm mb-2">Status: {loading ? 'Loading...' : error ? `Error: ${error}` : 'Ready'}</p>
          {signedUrl && !loading && !error && (
            <img 
              src={signedUrl} 
              alt={media.alt || 'Private image'} 
              className="w-full max-w-xs"
            />
          )}
        </>
      ) : (
        <>
          <p className="text-sm mb-2">Using direct URL (public image)</p>
          <img 
            src={media.url} 
            alt={media.alt || 'Public image'} 
            className="w-full max-w-xs"
          />
        </>
      )}
    </div>
  )
}
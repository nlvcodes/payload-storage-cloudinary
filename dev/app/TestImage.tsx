'use client'

import React, { useEffect, useState } from 'react'
import { fetchSignedURL } from 'payload-storage-cloudinary/client'

export function TestImage({ docId }: { docId: string }) {
  const [signedUrl, setSignedUrl] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [imageError, setImageError] = useState<string>('')

  useEffect(() => {
    async function loadImage() {
      try {
        const url = await fetchSignedURL('documents', docId)
        setSignedUrl(url)
      } catch (error) {
        setImageError(error instanceof Error ? error.message : 'Failed to fetch URL')
      } finally {
        setLoading(false)
      }
    }
    loadImage()
  }, [docId])

  if (loading) return <div>Loading image test...</div>

  return (
    <div style={{ 
      backgroundColor: '#fef3c7', 
      padding: '1rem', 
      borderRadius: '8px', 
      margin: '1rem 0',
      border: '1px solid #f59e0b'
    }}>
      <h3>🖼️ Image Display Test</h3>
      
      {imageError ? (
        <p style={{ color: 'red' }}>Error fetching URL: {imageError}</p>
      ) : (
        <>
          <p>✅ Signed URL fetched successfully</p>
          
          <div style={{ marginTop: '1rem' }}>
            <h4>Attempting to display image:</h4>
            <img 
              src={signedUrl} 
              alt="Test private image"
              style={{ maxWidth: '400px', height: 'auto', border: '1px solid #ccc' }}
              onLoad={() => console.log('✅ Image loaded successfully')}
              onError={(e) => {
                const target = e.target as HTMLImageElement
                console.error('❌ Image failed to load', {
                  src: target.src,
                  naturalWidth: target.naturalWidth,
                  naturalHeight: target.naturalHeight,
                  complete: target.complete,
                  error: e
                })
                setImageError('Image failed to load - check browser console and try opening in new tab')
              }}
            />
          </div>
          
          <details style={{ marginTop: '1rem' }}>
            <summary>Signed URL (click to show)</summary>
            <pre style={{ fontSize: '0.75rem', overflow: 'auto', padding: '0.5rem', backgroundColor: '#f3f4f6' }}>
              {signedUrl}
            </pre>
          </details>
          
          <div style={{ marginTop: '1rem' }}>
            <h4>Try opening URL directly:</h4>
            <a 
              href={signedUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              style={{ color: '#3b82f6', textDecoration: 'underline' }}
            >
              Open image in new tab
            </a>
          </div>
        </>
      )}
    </div>
  )
}
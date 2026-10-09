import { cloudinaryStorage } from 'payload-storage-cloudinary'

// Example 1: Basic private files
export const privateFilesConfig = cloudinaryStorage({
  cloudConfig: {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
    api_key: process.env.CLOUDINARY_API_KEY!,
    api_secret: process.env.CLOUDINARY_API_SECRET!,
  },
  collections: {
    documents: {
      privateFiles: true, // All files are private by default
      signedURLs: {
        enabled: true,
      },
    },
  },
})

// Example 2: Advanced signed URL configuration
export const advancedSignedURLConfig = cloudinaryStorage({
  cloudConfig: {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
    api_key: process.env.CLOUDINARY_API_KEY!,
    api_secret: process.env.CLOUDINARY_API_SECRET!,
  },
  collections: {
    protectedMedia: {
      signedURLs: {
        enabled: true,
        includeTransformations: true,
        authTypes: ['authenticated'],
        customAuthCheck: async (req, doc) => {
          // Custom access control logic
          if (!req.user) return false
          
          // Check if user has permission to view this document
          if (doc.allowedUsers && !doc.allowedUsers.includes(req.user.id)) {
            return false
          }
          
          // Check user role
          if (doc.minRole && req.user.role !== doc.minRole) {
            return false
          }
          
          return true
        },
      },
    },
  },
})

// Example 3: Mixed public and private files
export const mixedAccessConfig = cloudinaryStorage({
  cloudConfig: {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
    api_key: process.env.CLOUDINARY_API_KEY!,
    api_secret: process.env.CLOUDINARY_API_SECRET!,
  },
  collections: {
    media: {
      // Files are public by default
      privateFiles: false,
      signedURLs: {
        enabled: true,
      },
      // Users can mark individual files as private
    },
  },
})

// Example 4: Downloads
export const downloadConfig = cloudinaryStorage({
  cloudConfig: {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
    api_key: process.env.CLOUDINARY_API_KEY!,
    api_secret: process.env.CLOUDINARY_API_SECRET!,
  },
  collections: {
    downloads: {
      privateFiles: true,
      signedURLs: {
        enabled: true,
      },
    },
  },
})

// Example 5: Using signed URLs in your frontend
import { useState, useEffect } from 'react'

export function ProtectedImage({ docId, collectionSlug }) {
  const [imageUrl, setImageUrl] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  
  useEffect(() => {
    const fetchSignedUrl = async () => {
      try {
        const response = await fetch(`/api/${collectionSlug}/signed-url/${docId}`, {
          credentials: 'include', // Include auth cookies
        })
        
        if (!response.ok) {
          throw new Error('Failed to get signed URL')
        }
        
        const data = await response.json()
        setImageUrl(data.url)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    
    fetchSignedUrl()
  }, [docId, collectionSlug])
  
  if (loading) return <div>Loading...</div>
  if (error) return <div>Error: {error}</div>
  
  return <img src={imageUrl} alt="Protected content" />
}

// Example 6: Batch signed URLs for gallery
export async function getGalleryUrls(imageIds: string[], collectionSlug: string) {
  const response = await fetch(`/api/${collectionSlug}/signed-urls`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ ids: imageIds }),
  })
  
  const { results } = await response.json()
  
  return results.reduce((acc, result) => {
    if (!result.error) {
      acc[result.id] = result.url
    }
    return acc
  }, {})
}

// Example 7: Download link
// Signed URLs don't expire: hand the link only to a reader allowed to see the file.
export function DownloadButton({ doc, collectionSlug }) {
  const [downloadUrl, setDownloadUrl] = useState(null)
  
  const handleDownload = async () => {
    const response = await fetch(
      `/api/${collectionSlug}/signed-url/${doc.id}?download=true`,
      { credentials: 'include' }
    )
    
    const data = await response.json()
    
    // Create temporary download link
    const link = document.createElement('a')
    link.href = data.downloadUrl
    link.download = doc.filename
    link.click()
    
    setDownloadUrl(null)
  }
  
  return (
    <button onClick={handleDownload}>
      Download {doc.filename}
    </button>
  )
}
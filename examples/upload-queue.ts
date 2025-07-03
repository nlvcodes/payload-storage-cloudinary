import { cloudinaryStorage } from 'payload-storage-cloudinary'

// Example 1: Basic upload queue configuration
export const basicQueueConfig = cloudinaryStorage({
  cloudConfig: {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
    api_key: process.env.CLOUDINARY_API_KEY!,
    api_secret: process.env.CLOUDINARY_API_SECRET!,
  },
  collections: {
    media: {
      uploadQueue: {
        enabled: true,
      },
    },
  },
})

// Example 2: Advanced queue configuration
export const advancedQueueConfig = cloudinaryStorage({
  cloudConfig: {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
    api_key: process.env.CLOUDINARY_API_KEY!,
    api_secret: process.env.CLOUDINARY_API_SECRET!,
  },
  collections: {
    media: {
      uploadQueue: {
        enabled: true,
        maxConcurrentUploads: 5, // Allow 5 simultaneous uploads
        chunkSize: 50, // 50MB chunks for large files
        enableChunkedUploads: true,
        largeFileThreshold: 200, // Files > 200MB use chunked upload
      },
    },
  },
})

// Example 3: Different queue settings for different collections
export const multiCollectionQueueConfig = cloudinaryStorage({
  cloudConfig: {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
    api_key: process.env.CLOUDINARY_API_KEY!,
    api_secret: process.env.CLOUDINARY_API_SECRET!,
  },
  collections: {
    // Regular images - small queue
    images: {
      uploadQueue: {
        enabled: true,
        maxConcurrentUploads: 3,
      },
    },
    // Videos - larger queue with chunking
    videos: {
      uploadQueue: {
        enabled: true,
        maxConcurrentUploads: 2,
        chunkSize: 100, // 100MB chunks
        enableChunkedUploads: true,
        largeFileThreshold: 500, // Videos > 500MB use chunked upload
      },
    },
    // Documents - no queue needed
    documents: {
      uploadQueue: {
        enabled: false,
      },
    },
  },
})

// Example 4: Using upload status in your frontend
import { useEffect, useState } from 'react'

export function UploadProgress({ uploadId, collectionSlug }) {
  const [status, setStatus] = useState(null)
  
  useEffect(() => {
    if (!uploadId) return
    
    const checkStatus = async () => {
      const response = await fetch(`/api/${collectionSlug}/upload-status/${uploadId}`)
      const data = await response.json()
      setStatus(data)
      
      // Continue polling if still uploading
      if (data.status === 'queued' || data.status === 'uploading') {
        setTimeout(checkStatus, 1000) // Check every second
      }
    }
    
    checkStatus()
  }, [uploadId, collectionSlug])
  
  if (!status) return null
  
  return (
    <div>
      <div>Status: {status.status}</div>
      <div>Progress: {status.progress}%</div>
      {status.status === 'uploading' && (
        <progress value={status.progress} max="100" />
      )}
      {status.error && (
        <div style={{ color: 'red' }}>Error: {status.error}</div>
      )}
    </div>
  )
}

// Example 5: Cancel an upload
export async function cancelUpload(collectionSlug: string, uploadId: string) {
  const response = await fetch(`/api/${collectionSlug}/upload-cancel/${uploadId}`, {
    method: 'POST',
  })
  
  const result = await response.json()
  return result.success
}
'use client'

import React from 'react'
import { 
  createPrivateImageComponent, 
  useSignedURL,
  requiresSignedURL 
} from 'payload-storage-cloudinary/client'

// Create a private image component with auto-refresh
const PrivateImage = createPrivateImageComponent(React)

// Example 1: Basic Private Image Component

export function BasicPrivateImageExample({ media }: { media: any }) {
    if (!media) return <div>no media</div>

  return (
    <div>
      <h3>Basic Private Image</h3>
      <PrivateImage
        doc={media}
        collection="media"
        alt={media.alt || 'Private image'}
        className="w-full max-w-md"
      />
    </div>
  )
}

// Example 2: Using the useSignedURL hook directly
export function HookExample({ media }: { media: any }) {
  const { url, loading, error } = useSignedURL('media', media?.id, {
    refetchBuffer: 300, // Refresh 5 minutes before expiry
    react: React,
  })

  if (!media) return null
  if (loading) return <div>Loading...</div>
  if (error) return <div>Error loading image: {error.message}</div>

  return (
    <div>
      <h3>Using useSignedURL Hook</h3>
      <img
        src={url || ''}
        alt={media.alt || 'Private image'}
        className="w-full max-w-md"
      />
    </div>
  )
}

// Example 3: Conditional Private/Public Image
export function ConditionalImageExample({ media }: { media: any }) {
  const isPrivate = requiresSignedURL(media)
  
  if (!media) return null

  return (
    <div>
      <h3>Conditional Image (Private: {isPrivate ? 'Yes' : 'No'})</h3>
      {isPrivate ? (
        <PrivateImage
          doc={media}
          collection="media"
          alt={media.alt || 'Private image'}
          className="w-full max-w-md"
        />
      ) : (
        <img
          src={media.url}
          alt={media.alt || 'Public image'}
          className="w-full max-w-md"
        />
      )}
    </div>
  )
}

// Example 4: Gallery with Mixed Private/Public Images
export function MixedGalleryExample({ images }: { images: any[] }) {
  if (!images || images.length === 0) return null

  return (
    <div>
      <h3>Mixed Gallery</h3>
      <div className="grid grid-cols-3 gap-4">
        {images.map((image, index) => {
          const isPrivate = requiresSignedURL(image)
          
          return (
            <div key={index} className="relative">
              {isPrivate ? (
                <PrivateImage
                  doc={image}
                  collection="media"
                  alt={image.alt || `Gallery image ${index + 1}`}
                  className="w-full h-32 object-cover"
                />
              ) : (
                <img
                  src={image.thumbnailURL || image.url}
                  alt={image.alt || `Gallery image ${index + 1}`}
                  className="w-full h-32 object-cover"
                />
              )}
              <span className="absolute top-2 right-2 text-xs bg-black/50 text-white px-2 py-1 rounded">
                {isPrivate ? 'Private' : 'Public'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Example 5: Private Image with Transformations
export function TransformedPrivateImageExample({ media }: { media: any }) {
  const { url: thumbnailUrl } = useSignedURL('media', media?.id, {
    refetchBuffer: 300,
    react: React,
  })
  
  const { url: heroUrl } = useSignedURL('media', media?.id, {
    refetchBuffer: 300,
    react: React,
  })

  if (!media) return null

  return (
    <div>
      <h3>Private Image with Transformations</h3>
      <div className="space-y-4">
        <div>
          <p className="text-sm text-gray-600">Thumbnail (150x150):</p>
          {thumbnailUrl && (
            <img
              src={thumbnailUrl}
              alt={`${media.alt || 'Image'} thumbnail`}
              className="w-32 h-32 object-cover"
            />
          )}
        </div>
        <div>
          <p className="text-sm text-gray-600">Hero (1920x1080):</p>
          {heroUrl && (
            <img
              src={heroUrl}
              alt={`${media.alt || 'Image'} hero`}
              className="w-full max-w-2xl"
            />
          )}
        </div>
      </div>
    </div>
  )
}

// Example 6: Loading States and Error Handling
export function LoadingStatesExample({ media }: { media: any }) {
  const { url, loading, error } = useSignedURL('media', media?.id, {
    react: React,
  })

  if (!media) return null

  return (
    <div>
      <h3>Loading States and Error Handling</h3>
      <div className="space-y-4">
        {loading && (
          <div className="flex items-center space-x-2">
            <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full" />
            <span>Loading signed URL...</span>
          </div>
        )}
        
        {error && (
          <div className="bg-red-50 border border-red-200 p-4 rounded">
            <p className="text-red-600">Error: {error.message}</p>
          </div>
        )}
        
        {url && !loading && !error && (
          <div>
            <img
              src={url || ''}
              alt={media.alt || 'Private image'}
              className="w-full max-w-md"
            />
          </div>
        )}
      </div>
    </div>
  )
}
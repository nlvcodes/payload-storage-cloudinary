import React from 'react'
import { headers } from 'next/headers'
import { getPayload } from 'payload'
import configPromise from '@payload-config'

// Server Component for private images
export async function ServerPrivateImage({ 
  media, 
  alt,
  className,
  transformation 
}: { 
  media: any
  alt?: string
  className?: string
  transformation?: string
}) {
  if (!media) return null

  // Check if image requires signed URL
  if (!media.requiresSignedURL && !media.isPrivate) {
    // Public image - render directly
    return (
      <img
        src={media.url}
        alt={alt || media.alt || ''}
        className={className}
      />
    )
  }

  // Private image - get signed URL server-side
  try {
    const payload = await getPayload({ config: configPromise })
    const headersList = await headers()
    
    // Get the current host for the API call
    const host = headersList.get('host') || 'localhost:3001'
    const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http'
    
    // Fetch signed URL from the API endpoint
    const collection = media.collection || 'media'
    const response = await fetch(`${protocol}://${host}/api/${collection}/signed-url/${media.id}`, {
      method: 'GET',
      headers: {
        // Forward cookies for authentication
        'Cookie': headersList.get('cookie') || '',
      },
    })

    if (!response.ok) {
      console.error('Failed to get signed URL:', response.statusText)
      return null
    }

    const { url } = await response.json()

    return (
      <img
        src={url}
        alt={alt || media.alt || ''}
        className={className}
      />
    )
  } catch (error) {
    return <div>Unauthorized</div>
  }
}

// Server Component for responsive private images
export async function ServerResponsivePrivateImage({ 
  media, 
  alt,
  className,
  sizes = '100vw',
  transformations = {
    small: { width: 640, quality: 'auto', fetch_format: 'auto' },
    medium: { width: 1024, quality: 'auto', fetch_format: 'auto' },
    large: { width: 1920, quality: 'auto', fetch_format: 'auto' },
  }
}: { 
  media: any
  alt?: string
  className?: string
  sizes?: string
  transformations?: Record<string, any>
}) {
  if (!media) return null

  // For public images, generate srcset directly
  if (!media.requiresSignedURL && !media.isPrivate) {
    const baseUrl = media.url.split('?')[0]
    const srcSet = Object.entries(transformations)
      .map(([_, transform]) => {
        const transformStr = Object.entries(transform)
          .map(([key, value]) => `${key}_${value}`)
          .join(',')
        return `${baseUrl}?tr=${transformStr} ${transform.width}w`
      })
      .join(', ')

    return (
      <img
        src={media.url}
        srcSet={srcSet}
        sizes={sizes}
        alt={alt || media.alt || ''}
        className={className}
      />
    )
  }

  // For private images, we need to get signed URLs for each size
  // This is more complex and might need a custom endpoint
  // For now, just render the default signed URL
  return <ServerPrivateImage media={media} alt={alt} className={className} />
}

// Server Component Gallery with mixed private/public images
export async function ServerImageGallery({ 
  images,
  className = 'grid grid-cols-3 gap-4'
}: { 
  images: any[]
  className?: string
}) {
  if (!images || images.length === 0) return null

  return (
    <div className={className}>
      {images.map((image, index) => (
        <div key={image.id || index} className="relative">
          <ServerPrivateImage
            media={image}
            alt={image.alt || `Gallery image ${index + 1}`}
            className="w-full h-32 object-cover"
          />
          {(image.requiresSignedURL || image.isPrivate) && (
            <span className="absolute top-2 right-2 text-xs bg-black/50 text-white px-2 py-1 rounded">
              Private
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

// Server Component with loading placeholder
export async function ServerPrivateImageWithPlaceholder({ 
  media,
  alt,
  className,
  placeholderClassName = 'animate-pulse bg-gray-200'
}: { 
  media: any
  alt?: string
  className?: string
  placeholderClassName?: string
}) {
  if (!media) {
    return (
      <div className={`${className} ${placeholderClassName}`} />
    )
  }

  return (
    <React.Suspense 
      fallback={<div className={`${className} ${placeholderClassName}`} />}
    >
      <ServerPrivateImage
        media={media}
        alt={alt}
        className={className}
      />
    </React.Suspense>
  )
}
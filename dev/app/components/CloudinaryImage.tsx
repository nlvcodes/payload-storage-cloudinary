import React from 'react'
import { getTransformationUrl, commonPresets } from 'payload-storage-cloudinary'

interface CloudinaryImageProps {
  media: {
    cloudinaryPublicId: string
    cloudinaryVersion?: number
    alt?: string
    width?: number
    height?: number
  }
  transformation?: 'thumbnail' | 'card' | 'banner' | 'custom'
  customTransformations?: Record<string, any>
  className?: string
  style?: React.CSSProperties
}

/**
 * Reusable component for rendering Cloudinary images with transformations
 */
export function CloudinaryImage({ 
  media, 
  transformation = 'thumbnail',
  customTransformations,
  className,
  style 
}: CloudinaryImageProps) {
  // Generate the appropriate URL based on transformation type
  const imageUrl = transformation === 'custom' && customTransformations
    ? getTransformationUrl({
        publicId: media.cloudinaryPublicId,
        version: media.cloudinaryVersion,
        customTransformations,
      })
    : getTransformationUrl({
        publicId: media.cloudinaryPublicId,
        version: media.cloudinaryVersion,
        presetName: transformation,
        presets: commonPresets,
      })

  return (
    <img
      src={imageUrl}
      alt={media.alt || ''}
      width={media.width}
      height={media.height}
      className={className}
      style={style}
    />
  )
}

/**
 * Responsive image component with srcset for different screen sizes
 */
export function ResponsiveCloudinaryImage({ 
  media,
  sizes = '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw',
  className,
  style 
}: CloudinaryImageProps & { sizes?: string }) {
  const widths = [320, 640, 768, 1024, 1280, 1536]
  
  // Generate srcset
  const srcset = widths
    .map(width => {
      const url = getTransformationUrl({
        publicId: media.cloudinaryPublicId,
        version: media.cloudinaryVersion,
        customTransformations: {
          width,
          quality: 'auto',
          fetch_format: 'auto',
        },
      })
      return `${url} ${width}w`
    })
    .join(', ')

  // Default src (medium size)
  const src = getTransformationUrl({
    publicId: media.cloudinaryPublicId,
    version: media.cloudinaryVersion,
    customTransformations: {
      width: 768,
      quality: 'auto',
      fetch_format: 'auto',
    },
  })

  return (
    <img
      src={src}
      srcSet={srcset}
      sizes={sizes}
      alt={media.alt || ''}
      className={className}
      style={style}
      loading="lazy"
    />
  )
}

/**
 * Background image component
 */
export function CloudinaryBackgroundImage({
  media,
  children,
  overlayColor = 'rgba(0, 0, 0, 0.4)',
  height = '400px',
  className,
  style,
}: CloudinaryImageProps & { 
  children?: React.ReactNode
  overlayColor?: string
  height?: string
}) {
  const backgroundUrl = getTransformationUrl({
    publicId: media.cloudinaryPublicId,
    version: media.cloudinaryVersion,
    customTransformations: {
      width: 1920,
      height: 1080,
      crop: 'fill',
      gravity: 'auto',
      quality: 'auto:eco',
      fetch_format: 'auto',
    },
  })

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        height,
        backgroundImage: `url(${backgroundUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        ...style,
      }}
    >
      {overlayColor && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: overlayColor,
          }}
        />
      )}
      {children && (
        <div style={{ position: 'relative', zIndex: 1 }}>
          {children}
        </div>
      )}
    </div>
  )
}
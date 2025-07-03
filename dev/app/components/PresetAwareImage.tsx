import React from 'react'
import { getTransformationUrl, commonPresets } from 'payload-storage-cloudinary'

interface Media {
  url: string
  thumbnailURL?: string
  cloudinaryPublicId?: string
  cloudinaryVersion?: number
  transformationPreset?: string
  alt?: string
}

interface PresetAwareImageProps {
  media: Media
  className?: string
  style?: React.CSSProperties
  // Override the stored preset if needed
  forcePreset?: 'thumbnail' | 'card' | 'banner'
  // Fallback if no preset is stored
  defaultPreset?: 'thumbnail' | 'card' | 'banner'
}

/**
 * Smart image component that uses the transformation preset
 * selected during upload in the CMS
 */
export function PresetAwareImage({ 
  media, 
  className,
  style,
  forcePreset,
  defaultPreset = 'thumbnail'
}: PresetAwareImageProps) {
  // Determine which preset to use
  const presetToUse = forcePreset || media.transformationPreset || defaultPreset
  
  // If we have Cloudinary data, use it to generate the URL with the preset
  if (media.cloudinaryPublicId) {
    const transformedUrl = getTransformationUrl({
      publicId: media.cloudinaryPublicId,
      version: media.cloudinaryVersion,
      presetName: presetToUse,
      presets: commonPresets,
    })
    
    return (
      <img 
        src={transformedUrl}
        alt={media.alt || ''}
        className={className}
        style={style}
        data-preset={presetToUse}
      />
    )
  }
  
  // Fallback to default URL
  return (
    <img 
      src={media.url}
      alt={media.alt || ''}
      className={className}
      style={style}
    />
  )
}

// Example usage in different contexts
export function BlogPostHero({ post }: { post: any }) {
  return (
    <div className="blog-hero">
      {/* Use the preset selected in CMS, or 'banner' as fallback */}
      <PresetAwareImage 
        media={post.featuredImage}
        defaultPreset="banner"
        style={{ width: '100%', height: '400px', objectFit: 'cover' }}
      />
      <h1>{post.title}</h1>
    </div>
  )
}

export function ProductGrid({ products }: { products: any[] }) {
  return (
    <div className="product-grid">
      {products.map(product => (
        <div key={product.id} className="product-card">
          {/* Use the preset selected in CMS, or 'card' as fallback */}
          <PresetAwareImage 
            media={product.image}
            defaultPreset="card"
            className="product-image"
          />
          <h3>{product.name}</h3>
          <p>${product.price}</p>
        </div>
      ))}
    </div>
  )
}

export function UserAvatar({ user }: { user: any }) {
  return (
    <div className="user-avatar">
      {/* Force thumbnail preset for avatars regardless of CMS selection */}
      <PresetAwareImage 
        media={user.avatar}
        forcePreset="thumbnail"
        style={{ 
          width: '48px', 
          height: '48px', 
          borderRadius: '50%',
          objectFit: 'cover'
        }}
      />
    </div>
  )
}
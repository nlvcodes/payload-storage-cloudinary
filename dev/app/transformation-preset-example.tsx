import { getPayload } from "payload"
import config from '@payload-config'
import { getTransformationUrl, commonPresets } from 'payload-storage-cloudinary'

/**
 * Example showing how transformation preset selection works
 * 
 * When you configure the plugin with:
 * transformations: {
 *   enablePresetSelection: true,
 *   presets: commonPresets,
 * }
 * 
 * The plugin automatically adds a select field to your collection
 * that allows users to choose a preset during upload.
 */

// Example of what gets stored in the database
interface MediaWithPreset {
  id: string
  filename: string
  url: string // Has default transformations applied
  thumbnailURL: string // Always 150x150
  cloudinaryPublicId: string
  cloudinaryVersion?: number
  
  // This field is added when enablePresetSelection is true
  transformationPreset?: 'thumbnail' | 'card' | 'banner' | string
  
  // Other standard fields
  alt?: string
  width?: number
  height?: number
}

export async function TransformationPresetExample() {
  const payload = await getPayload({ config })
  
  // Get media items - some may have presets selected
  const mediaItems = await payload.find({
    collection: 'media',
    limit: 10,
  })

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Transformation Preset Examples</h1>
      
      <div style={{ marginBottom: '2rem', padding: '1rem', backgroundColor: '#f0f0f0', borderRadius: '8px' }}>
        <h3>How Preset Selection Works:</h3>
        <ol>
          <li>During upload, users see a "Transformation Preset" dropdown</li>
          <li>They can select from configured presets (thumbnail, card, banner)</li>
          <li>The selected preset name is stored in the <code>transformationPreset</code> field</li>
          <li>You can then apply the preset transformation when rendering</li>
        </ol>
      </div>

      <div style={{ display: 'grid', gap: '2rem' }}>
        {mediaItems.docs.map((media) => (
          <MediaWithPresetDisplay key={media.id} media={media as any} />
        ))}
      </div>
    </div>
  )
}

function MediaWithPresetDisplay({ media }: { media: MediaWithPreset }) {
  // Check if a preset was selected during upload
  const hasPreset = !!media.transformationPreset
  
  // Generate the URL with the selected preset
  const presetUrl = hasPreset && media.cloudinaryPublicId
    ? getTransformationUrl({
        publicId: media.cloudinaryPublicId,
        version: media.cloudinaryVersion,
        presetName: media.transformationPreset!,
        presets: commonPresets,
      })
    : null

  return (
    <div style={{ 
      border: '1px solid #ddd', 
      padding: '1rem', 
      borderRadius: '8px',
      backgroundColor: hasPreset ? '#f0fff0' : '#fff'
    }}>
      <h3>{media.filename}</h3>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
        {/* Original with default transformations */}
        <div>
          <h4>Default URL</h4>
          <img 
            src={media.url} 
            alt="Default" 
            style={{ width: '100%', height: 'auto' }}
          />
          <p style={{ fontSize: '0.875rem', color: '#666' }}>
            Uses default transformations from config
          </p>
        </div>

        {/* Admin thumbnail */}
        <div>
          <h4>Admin Thumbnail</h4>
          <img 
            src={media.thumbnailURL} 
            alt="Thumbnail" 
            style={{ width: '150px', height: '150px' }}
          />
          <p style={{ fontSize: '0.875rem', color: '#666' }}>
            Always 150x150 for admin UI
          </p>
        </div>

        {/* Preset transformation if selected */}
        <div>
          <h4>Selected Preset</h4>
          {hasPreset && presetUrl ? (
            <>
              <img 
                src={presetUrl} 
                alt={`${media.transformationPreset} preset`} 
                style={{ width: '100%', height: 'auto' }}
              />
              <p style={{ fontSize: '0.875rem', color: '#666' }}>
                Preset: <strong>{media.transformationPreset}</strong>
              </p>
            </>
          ) : (
            <div style={{ 
              height: '150px', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              backgroundColor: '#f5f5f5',
              borderRadius: '4px'
            }}>
              <p style={{ color: '#999' }}>No preset selected</p>
            </div>
          )}
        </div>
      </div>

      {/* Show the stored data */}
      <details style={{ marginTop: '1rem' }}>
        <summary>Stored Data</summary>
        <pre style={{ fontSize: '0.75rem', overflow: 'auto' }}>
{JSON.stringify({
  transformationPreset: media.transformationPreset || null,
  cloudinaryPublicId: media.cloudinaryPublicId,
  cloudinaryVersion: media.cloudinaryVersion,
  url: media.url,
  thumbnailURL: media.thumbnailURL,
}, null, 2)}
        </pre>
      </details>
    </div>
  )
}

// Example: React component that uses preset transformations
interface ImageWithPresetProps {
  media: MediaWithPreset
  fallbackPreset?: 'thumbnail' | 'card' | 'banner'
  className?: string
}

export function ImageWithPreset({ 
  media, 
  fallbackPreset = 'thumbnail',
  className 
}: ImageWithPresetProps) {
  // Use the stored preset or fall back to a default
  const presetToUse = media.transformationPreset || fallbackPreset
  
  // Generate URL with the appropriate preset
  const imageUrl = media.cloudinaryPublicId
    ? getTransformationUrl({
        publicId: media.cloudinaryPublicId,
        version: media.cloudinaryVersion,
        presetName: presetToUse,
        presets: commonPresets,
      })
    : media.url // Fallback to default URL

  return (
    <img 
      src={imageUrl} 
      alt={media.alt || ''} 
      className={className}
    />
  )
}

// Example: Using preset in a product card
export function ProductCard({ product }: { product: any }) {
  const image = product.productImage as MediaWithPreset
  
  return (
    <div className="product-card">
      {/* Use the preset if selected, otherwise use 'card' preset */}
      <ImageWithPreset 
        media={image} 
        fallbackPreset="card"
      />
      <h3>{product.name}</h3>
      <p>${product.price}</p>
    </div>
  )
}

// Example: Conditional rendering based on preset
export function SmartImage({ media }: { media: MediaWithPreset }) {
  // Different rendering strategies based on selected preset
  switch (media.transformationPreset) {
    case 'thumbnail':
      return (
        <div className="thumbnail-container">
          <img 
            src={getTransformationUrl({
              publicId: media.cloudinaryPublicId,
              version: media.cloudinaryVersion,
              presetName: 'thumbnail',
              presets: commonPresets,
            })}
            alt={media.alt || ''}
            style={{ width: '150px', height: '150px', objectFit: 'cover' }}
          />
        </div>
      )
    
    case 'banner':
      return (
        <div className="banner-container">
          <img 
            src={getTransformationUrl({
              publicId: media.cloudinaryPublicId,
              version: media.cloudinaryVersion,
              presetName: 'banner',
              presets: commonPresets,
            })}
            alt={media.alt || ''}
            style={{ width: '100%', height: '300px', objectFit: 'cover' }}
          />
        </div>
      )
    
    case 'card':
      return (
        <div className="card-image-container">
          <img 
            src={getTransformationUrl({
              publicId: media.cloudinaryPublicId,
              version: media.cloudinaryVersion,
              presetName: 'card',
              presets: commonPresets,
            })}
            alt={media.alt || ''}
            style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover' }}
          />
        </div>
      )
    
    default:
      // No preset selected, use default URL
      return <img src={media.url} alt={media.alt || ''} />
  }
}
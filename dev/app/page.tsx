import {getPayload} from "payload";
import config from '@payload-config'
import { getTransformationUrl, commonPresets } from 'payload-storage-cloudinary'

export default async function Home() {
    const payload = await getPayload({config})
    
    // Get all media items for demonstration
    const mediaItems = await payload.find({
        collection: 'media',
        limit: 10,
    })

    // Get a product with an image
    const product = await payload.find({
        collection: 'products',
        limit: 1,
        depth: 1, // Populate the productImage relationship
    }).then(res => res.docs[0])

    return (
        <div style={{ padding: '2rem', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
            <h1>Cloudinary Storage Plugin Examples</h1>
            <p>Go to <a href="/admin">/admin</a> to access the Payload admin panel.</p>
            
            <h2>Media Collection Examples</h2>
            {mediaItems.docs.length === 0 ? (
                <p>No media items found. Upload some images in the admin panel first.</p>
            ) : (
                <div style={{ display: 'grid', gap: '2rem' }}>
                    {mediaItems.docs.map((media) => (
                        <div key={media.id} style={{ border: '1px solid #eee', padding: '1rem', borderRadius: '8px' }}>
                            <h3>{media.filename}</h3>
                            
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                                {/* Original Image */}
                                <div>
                                    <h4>Original</h4>
                                    <img
                                        src={media.url || ''}
                                        alt={media.alt || 'Original'}
                                        style={{ maxWidth: '100%', height: 'auto' }}
                                    />
                                    <p style={{ fontSize: '0.875rem', color: '#666' }}>
                                        URL: {media.url}
                                    </p>
                                    {(media as any).transformationPreset && (
                                        <p style={{ fontSize: '0.875rem', color: '#0066cc' }}>
                                            Selected Preset: <strong>{(media as any).transformationPreset}</strong>
                                        </p>
                                    )}
                                </div>

                                {/* Thumbnail using preset */}
                                <div>
                                    <h4>Thumbnail (150x150)</h4>
                                    <img
                                        src={getTransformationUrl({
                                            publicId: media.cloudinaryPublicId || '',
                                            version: media.cloudinaryVersion || undefined,
                                            presetName: 'thumbnail',
                                            presets: commonPresets,
                                        })}
                                        alt="Thumbnail"
                                        style={{ maxWidth: '100%', height: 'auto' }}
                                    />
                                </div>

                                {/* Use stored preset if available */}
                                {(media as any).transformationPreset && (
                                    <div>
                                        <h4>Using Stored Preset</h4>
                                        <img
                                            src={getTransformationUrl({
                                                publicId: media.cloudinaryPublicId || '',
                                                version: media.cloudinaryVersion || undefined,
                                                presetName: (media as any).transformationPreset,
                                                presets: commonPresets,
                                            })}
                                            alt={`${(media as any).transformationPreset} preset`}
                                            style={{ maxWidth: '100%', height: 'auto' }}
                                        />
                                        <p style={{ fontSize: '0.875rem', color: '#0066cc' }}>
                                            Applied: {(media as any).transformationPreset}
                                        </p>
                                    </div>
                                )}

                                {/* Custom transformation */}
                                <div>
                                    <h4>Rounded & Grayscale</h4>
                                    <img
                                        src={media.cloudinaryPublicId ? getTransformationUrl({
                                            publicId: media.cloudinaryPublicId,
                                            version: media.cloudinaryVersion || undefined,
                                            customTransformations: {
                                                width: 200,
                                                height: 200,
                                                crop: 'fill',
                                                gravity: 'face',
                                                radius: 'max',
                                                effect: 'grayscale',
                                            },
                                        }) : ''}
                                        alt="Rounded Grayscale"
                                        style={{ maxWidth: '100%', height: 'auto' }}
                                    />
                                </div>

                                {/* Optimized for web */}
                                <div>
                                    <h4>Web Optimized</h4>
                                    <img
                                        src={media.cloudinaryPublicId ? getTransformationUrl({
                                            publicId: media.cloudinaryPublicId,
                                            version: media.cloudinaryVersion || undefined,
                                            customTransformations: {
                                                width: 400,
                                                quality: 'auto',
                                                fetch_format: 'auto',
                                                dpr: 'auto',
                                            },
                                        }) : ''}
                                        alt="Web Optimized"
                                        style={{ maxWidth: '100%', height: 'auto' }}
                                    />
                                </div>
                            </div>

                            <details style={{ marginTop: '1rem' }}>
                                <summary>Image Data</summary>
                                <pre style={{ fontSize: '0.75rem', overflow: 'auto' }}>
                                    {JSON.stringify({
                                        id: media.id,
                                        filename: media.filename,
                                        cloudinaryPublicId: media.cloudinaryPublicId,
                                        cloudinaryFolder: media.cloudinaryFolder,
                                        width: media.width,
                                        height: media.height,
                                        filesize: media.filesize,
                                    }, null, 2)}
                                </pre>
                            </details>
                        </div>
                    ))}
                </div>
            )}

            {product && typeof product.productImage !== 'string' && (
                <>
                    <h2>Product Image Example</h2>
                    <div style={{ border: '1px solid #eee', padding: '1rem', borderRadius: '8px' }}>
                        <h3>{product.name}</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
                            {/* Product hero image */}
                            <div>
                                <h4>Hero Image (1200x600)</h4>
                                <img
                                    src={product.productImage.cloudinaryPublicId ? getTransformationUrl({
                                        publicId: product.productImage.cloudinaryPublicId,
                                        version: product.productImage.cloudinaryVersion || undefined,
                                        customTransformations: {
                                            width: 1200,
                                            height: 600,
                                            crop: 'fill',
                                            gravity: 'auto',
                                            quality: 'auto:best',
                                        },
                                    }) : ''}
                                    alt={product.name}
                                    style={{ maxWidth: '100%', height: 'auto' }}
                                />
                            </div>

                            {/* Product card */}
                            <div>
                                <h4>Product Card (400x400)</h4>
                                <img
                                    src={product.productImage.cloudinaryPublicId ? getTransformationUrl({
                                        publicId: product.productImage.cloudinaryPublicId,
                                        version: product.productImage.cloudinaryVersion || undefined,
                                        presetName: 'card',
                                        presets: commonPresets,
                                    }) : ''}
                                    alt={product.name}
                                    style={{ maxWidth: '100%', height: 'auto' }}
                                />
                            </div>
                        </div>
                    </div>
                </>
            )}

            <h2>Dynamic Transformation Examples</h2>
            <div style={{ backgroundColor: '#f5f5f5', padding: '1rem', borderRadius: '8px', marginTop: '2rem' }}>
                <h3>Using CMS-Configured Transformations</h3>
                <pre style={{ overflow: 'auto' }}>{`
// The 'url' field contains default transformations from your config:
// transformations: {
//   default: {
//     quality: 'auto',
//     fetch_format: 'auto',
//   }
// }
const defaultUrl = media.url // Already has quality:auto, fetch_format:auto

// The 'thumbnailURL' is always 150x150 for admin UI
const adminThumbnail = media.thumbnailURL
                `}</pre>

                <h3>Dynamic Context-Based Transformations</h3>
                <pre style={{ overflow: 'auto' }}>{`
// Apply different transformations based on where image is used
const heroImageUrl = getTransformationUrl({
    publicId: media.cloudinaryPublicId,
    version: media.cloudinaryVersion,
    customTransformations: {
        width: 1920,
        height: 600,
        crop: 'fill',
        gravity: 'auto',
        quality: 'auto:best', // Higher quality for hero
    },
})

const thumbnailUrl = getTransformationUrl({
    publicId: media.cloudinaryPublicId,
    version: media.cloudinaryVersion,
    customTransformations: {
        width: 300,
        height: 300,
        crop: 'thumb',
        gravity: 'face', // Focus on faces for thumbnails
        quality: 'auto',
    },
})
                `}</pre>

                <h3>Responsive Images</h3>
                <pre style={{ overflow: 'auto' }}>{`
// Generate multiple sizes for responsive images
<picture>
  <source
    media="(max-width: 640px)"
    srcSet={getTransformationUrl({
      publicId: media.cloudinaryPublicId,
      version: media.cloudinaryVersion,
      customTransformations: { width: 640, quality: 'auto' }
    })}
  />
  <source
    media="(max-width: 1024px)"
    srcSet={getTransformationUrl({
      publicId: media.cloudinaryPublicId,
      version: media.cloudinaryVersion,
      customTransformations: { width: 1024, quality: 'auto' }
    })}
  />
  <img src={defaultUrl} alt={media.alt} />
</picture>
                `}</pre>

                <h3>Using Stored Presets (if enablePresetSelection: true)</h3>
                <pre style={{ overflow: 'auto' }}>{`
// If you have preset selection enabled in config:
// transformations: {
//   enablePresetSelection: true,
//   presets: commonPresets,
// }

// The selected preset would be stored as:
const selectedPreset = media.transformationPreset

// Apply the selected preset:
const presetUrl = selectedPreset ? 
  getTransformationUrl({
    publicId: media.cloudinaryPublicId,
    version: media.cloudinaryVersion,
    presetName: selectedPreset,
    presets: commonPresets,
  }) : media.url
                `}</pre>
            </div>
        </div>
    )
}
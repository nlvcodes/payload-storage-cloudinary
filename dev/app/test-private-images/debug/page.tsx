import { getPayload } from 'payload'
import configPromise from '@payload-config'

export default async function DebugPage() {
  const payload = await getPayload({ config: configPromise })
  
  // Fetch all media items
  const { docs: mediaItems } = await payload.find({
    collection: 'media',
    limit: 10,
  })

  // Get collection config to see if privateFiles is enabled
  const mediaCollection = payload.config.collections?.find(c => c.slug === 'media')

  return (
    <div className="container mx-auto p-8">
      <h1 className="text-2xl font-bold mb-4">Debug: Media Collection</h1>
      
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-2">Collection Config</h2>
        <pre className="bg-gray-100 p-4 rounded overflow-auto">
          {JSON.stringify({
            slug: mediaCollection?.slug,
            upload: mediaCollection?.upload ? 'enabled' : 'disabled',
            fields: mediaCollection?.fields?.map(f => ({
              name: f.name,
              type: f.type,
            })),
          }, null, 2)}
        </pre>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-2">Media Items ({mediaItems.length})</h2>
        {mediaItems.length === 0 ? (
          <p className="text-gray-500">No media items found. Please upload some images in the admin panel.</p>
        ) : (
          <div className="space-y-4">
            {mediaItems.map((item, i) => (
              <div key={item.id} className="bg-gray-50 p-4 rounded">
                <h3 className="font-medium mb-2">Item {i + 1}: {item.filename}</h3>
                <pre className="bg-white p-2 rounded text-sm overflow-auto">
                  {JSON.stringify({
                    id: item.id,
                    filename: item.filename,
                    url: item.url?.substring(0, 100) + '...',
                    cloudinaryPublicId: item.cloudinaryPublicId,
                    cloudinaryUrl: item.cloudinaryUrl?.substring(0, 100) + '...',
                    isPrivate: item.isPrivate,
                    requiresSignedURL: item.requiresSignedURL,
                    mimeType: item.mimeType,
                    filesize: item.filesize,
                    hasAllCloudinaryFields: !!(item.cloudinaryPublicId && item.cloudinaryVersion && item.cloudinaryResourceType),
                  }, null, 2)}
                </pre>
                
                {item.url && (
                  <div className="mt-2">
                    <p className="text-sm font-medium">Preview:</p>
                    <img 
                      src={item.thumbnailURL || item.url} 
                      alt={item.alt || 'Preview'} 
                      className="w-32 h-32 object-cover mt-1 border"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-2">Instructions</h2>
        <ol className="list-decimal list-inside space-y-2">
          <li>Go to <a href="/admin/collections/media" className="text-blue-600 underline">Admin Panel - Media</a></li>
          <li>Upload a new image</li>
          <li>Make sure "Private File" checkbox is CHECKED for private images</li>
          <li>Upload another image with "Private File" UNCHECKED for public images</li>
          <li>Come back here to see the data</li>
          <li>Then visit <a href="/test-private-images" className="text-blue-600 underline">Test Private Images</a> to see examples</li>
        </ol>
      </section>
    </div>
  )
}
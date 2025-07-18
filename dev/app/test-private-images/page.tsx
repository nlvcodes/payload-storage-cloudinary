import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { 
  BasicPrivateImageExample,
  HookExample,
  ConditionalImageExample,
  MixedGalleryExample,
  TransformedPrivateImageExample,
  LoadingStatesExample
} from '../PrivateImageExamples'
import {
  ServerPrivateImage,
  ServerImageGallery,
  ServerPrivateImageWithPlaceholder
} from '../ServerPrivateImage'
import { SimplePrivateImageTest } from '../SimplePrivateImageTest'

export default async function TestPrivateImagesPage() {
  const payload = await getPayload({ config: configPromise })
  
  // Fetch some test images
  const { docs: mediaItems } = await payload.find({
    collection: 'media',
    limit: 10,
  })

  const privateImage = mediaItems.find(m => m.isPrivate === true)
  const publicImage = mediaItems.find(m => m.isPrivate === false)

  return (
    <div className="container mx-auto p-8 space-y-12">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Private Image Examples</h1>
        <a href="/test-private-images/debug" className="text-blue-600 underline">Debug Info</a>
      </div>
      
      {mediaItems.length === 0 && (
        <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded">
          <p>No media items found. Please <a href="/admin/collections/media" className="underline">upload some images</a> first.</p>
          <p className="mt-2">Make sure to upload:</p>
          <ul className="list-disc list-inside mt-1">
            <li>At least one image with "Private File" checked</li>
            <li>At least one image with "Private File" unchecked</li>
          </ul>
        </div>
      )}

      {/* Simple Test First */}
      <section className="space-y-6">
        <h2 className="text-2xl font-semibold">Simple Test</h2>
        <div className="bg-yellow-50 p-6 rounded-lg">
          {mediaItems.map((item) => (
            <SimplePrivateImageTest key={item.id} media={item} />
          ))}
        </div>
      </section>

      {/* Server Components Section */}
      <section className="space-y-6">
        <h2 className="text-2xl font-semibold">Server Components (SSR)</h2>
        
        <div className="bg-gray-50 p-6 rounded-lg">
          <h3 className="text-lg font-medium mb-4">Server-Side Private Image</h3>
          {privateImage && (
            <ServerPrivateImage
              media={privateImage}
              alt="Private image example"
              className="w-full max-w-md rounded shadow"
            />
          )}
          {!privateImage && (
            <p className="text-gray-500">No private images found. Upload an image with "Private File" checked.</p>
          )}
        </div>

        <div className="bg-gray-50 p-6 rounded-lg">
          <h3 className="text-lg font-medium mb-4">Server-Side Gallery</h3>
          <ServerImageGallery images={mediaItems} />
        </div>

        <div className="bg-gray-50 p-6 rounded-lg">
          <h3 className="text-lg font-medium mb-4">With Loading Placeholder</h3>
          {privateImage && (
            <ServerPrivateImageWithPlaceholder
              media={privateImage}
              alt="Private image with placeholder"
              className="w-full max-w-md rounded shadow"
            />
          )}
        </div>
      </section>

      {/* Client Components Section */}
      <section className="space-y-6">
        <h2 className="text-2xl font-semibold">Client Components</h2>
        
        {privateImage && (
          <>
            <div className="bg-blue-50 p-6 rounded-lg">
              <BasicPrivateImageExample media={privateImage} />
            </div>

            <div className="bg-blue-50 p-6 rounded-lg">
              <HookExample media={privateImage} />
            </div>

            <div className="bg-blue-50 p-6 rounded-lg">
              <LoadingStatesExample media={privateImage} />
            </div>

            <div className="bg-blue-50 p-6 rounded-lg">
              <TransformedPrivateImageExample media={privateImage} />
            </div>
          </>
        )}

        {publicImage && (
          <div className="bg-green-50 p-6 rounded-lg">
            <ConditionalImageExample media={publicImage} />
          </div>
        )}

        <div className="bg-purple-50 p-6 rounded-lg">
          <MixedGalleryExample images={mediaItems} />
        </div>
      </section>

      {/* Information Section */}
      <section className="bg-yellow-50 p-6 rounded-lg">
        <h2 className="text-xl font-semibold mb-4">How Private Files Work</h2>
        <ul className="space-y-2 list-disc list-inside">
          <li>When privateFiles is enabled on a collection, an "isPrivate" checkbox appears</li>
          <li>Checked = Private (requires signed URLs), Unchecked = Public</li>
          <li>Private files use signed URLs that expire (default: 1 hour)</li>
          <li>Client components auto-refresh URLs before expiry</li>
          <li>Server components fetch signed URLs during SSR</li>
          <li>The plugin respects per-file privacy settings</li>
        </ul>
      </section>

      {/* Debug Section */}
      <section className="bg-gray-100 p-6 rounded-lg">
        <h2 className="text-xl font-semibold mb-4">Debug Info</h2>
        <div className="space-y-4">
          <div>
            <h3 className="font-medium">Private Image Data:</h3>
            {privateImage && (
              <pre className="bg-white p-4 rounded mt-2 overflow-auto text-sm">
                {JSON.stringify({
                  id: privateImage.id,
                  isPrivate: privateImage.isPrivate,
                  requiresSignedURL: privateImage.requiresSignedURL,
                  url: privateImage.url?.substring(0, 50) + '...',
                  cloudinaryPublicId: privateImage.cloudinaryPublicId,
                }, null, 2)}
              </pre>
            )}
          </div>
          <div>
            <h3 className="font-medium">Public Image Data:</h3>
            {publicImage && (
              <pre className="bg-white p-4 rounded mt-2 overflow-auto text-sm">
                {JSON.stringify({
                  id: publicImage.id,
                  isPrivate: publicImage.isPrivate,
                  requiresSignedURL: publicImage.requiresSignedURL,
                  url: publicImage.url?.substring(0, 50) + '...',
                  cloudinaryPublicId: publicImage.cloudinaryPublicId,
                }, null, 2)}
              </pre>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
import { getPayload } from 'payload'
import configPromise from '@payload-config'

export default async function TestPrivateUrlStructure() {
  const payload = await getPayload({ config: configPromise })
  
  // Get the specific private file
  const privateFile = await payload.findByID({
    collection: 'media',
    id: '6865e04cd16a3a081a9d811c',
  }).catch(() => null)

  // Get a few more media items for comparison
  const { docs: mediaItems } = await payload.find({
    collection: 'media',
    limit: 5,
  })

  return (
    <div className="container mx-auto p-8">
      <h1 className="text-2xl font-bold mb-6">Private File URL Structure Analysis</h1>
      
      {privateFile && (
        <div className="mb-8 p-6 bg-blue-50 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">Your Private File Details</h2>
          <div className="space-y-2 text-sm">
            <p><strong>ID:</strong> {privateFile.id}</p>
            <p><strong>Filename:</strong> {privateFile.filename}</p>
            <p><strong>Is Private:</strong> {privateFile.isPrivate ? 'Yes' : 'No'}</p>
            <p><strong>Requires Signed URL:</strong> {privateFile.requiresSignedURL ? 'Yes' : 'No'}</p>
            <p><strong>Cloudinary Public ID:</strong> {privateFile.cloudinaryPublicId}</p>
            <p><strong>URL:</strong></p>
            <div className="bg-white p-2 rounded overflow-x-auto">
              <code className="text-xs">{privateFile.url}</code>
            </div>
            <p><strong>Cloudinary URL:</strong></p>
            <div className="bg-white p-2 rounded overflow-x-auto">
              <code className="text-xs">{privateFile.cloudinaryUrl}</code>
            </div>
            
            {privateFile.url && (
              <div className="mt-4">
                <p className="font-medium mb-2">URL Analysis:</p>
                <div className="bg-white p-3 rounded text-xs">
                  {privateFile.url.includes('/authenticated/') && (
                    <p className="text-green-600">✓ URL contains /authenticated/ path (private file)</p>
                  )}
                  {privateFile.url.includes('s--') && privateFile.url.includes('--') && (
                    <p className="text-green-600">✓ URL contains signature (s--...--)</p>
                  )}
                  {!privateFile.url.includes('/authenticated/') && (
                    <p className="text-red-600">✗ URL does not contain /authenticated/ path (might be public)</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="space-y-6">
        <h2 className="text-xl font-semibold">All Media Items Comparison</h2>
        {mediaItems.map((item, index) => (
          <div key={item.id} className={`p-4 rounded-lg ${item.isPrivate ? 'bg-red-50' : 'bg-green-50'}`}>
            <h3 className="font-medium mb-2">
              {index + 1}. {item.filename} 
              <span className={`ml-2 text-sm ${item.isPrivate ? 'text-red-600' : 'text-green-600'}`}>
                ({item.isPrivate ? 'Private' : 'Public'})
              </span>
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p><strong>Is Private:</strong> {item.isPrivate ? 'Yes' : 'No'}</p>
                <p><strong>Requires Signed URL:</strong> {item.requiresSignedURL ? 'Yes' : 'No'}</p>
                <p><strong>Has Authenticated URL:</strong> {item.url?.includes('/authenticated/') ? 'Yes' : 'No'}</p>
              </div>
              <div>
                <p className="font-medium mb-1">URL Preview:</p>
                <div className="bg-white p-2 rounded overflow-hidden">
                  <code className="text-xs break-all">{item.url?.substring(0, 100)}...</code>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 p-6 bg-gray-100 rounded-lg">
        <h3 className="text-lg font-semibold mb-3">Understanding Cloudinary Private Files</h3>
        <div className="space-y-3 text-sm">
          <div>
            <h4 className="font-medium">Private File URLs contain:</h4>
            <ul className="list-disc list-inside ml-4 mt-1">
              <li><code>/authenticated/</code> in the path</li>
              <li>A signature like <code>s--XXXXXX--</code></li>
              <li>These URLs work even without additional signing because they're pre-authenticated</li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-medium">How it works:</h4>
            <ul className="list-disc list-inside ml-4 mt-1">
              <li>When uploaded with <code>type: 'authenticated'</code>, Cloudinary creates a pre-signed URL</li>
              <li>The plugin stores this pre-signed URL in the <code>url</code> field</li>
              <li>Access control is enforced by Payload's collection permissions</li>
              <li>If you're logged in, you can access the signed URL endpoint</li>
            </ul>
          </div>

          <div>
            <h4 className="font-medium">Testing access control:</h4>
            <ol className="list-decimal list-inside ml-4 mt-1">
              <li>Log out of the admin panel</li>
              <li>Try to access <code>/api/media/signed-url/{privateFile?.id || 'ID'}</code></li>
              <li>You should get a 403 Forbidden error</li>
              <li>The private file URL won't be accessible without authentication</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  )
}
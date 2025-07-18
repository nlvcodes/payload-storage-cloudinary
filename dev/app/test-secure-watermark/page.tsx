'use client'

import { useState, useEffect } from 'react'

export default function TestSecureWatermark() {
  const [images, setImages] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Fetch watermarked media
    fetch('/api/watermarked-media')
      .then(res => res.json())
      .then(data => {
        setImages(data.docs || [])
        setLoading(false)
      })
      .catch(err => {
        console.error('Error fetching images:', err)
        setLoading(false)
      })
  }, [])

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Secure Watermarked Images Test</h1>
      
      <div className="mb-8 p-4 bg-blue-50 rounded">
        <h2 className="font-semibold mb-2">How it works:</h2>
        <ul className="list-disc list-inside space-y-1 text-sm">
          <li>Images are served through a server endpoint, not directly from Cloudinary</li>
          <li>Watermarks are applied server-side and cannot be removed by URL manipulation</li>
          <li>The actual Cloudinary URLs are never exposed to the client</li>
        </ul>
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : images.length === 0 ? (
        <p>No watermarked images found. Upload some to the "Watermarked Media (Secure)" collection.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {images.map((image) => (
            <div key={image.id} className="border rounded p-4">
              <h3 className="font-semibold mb-2">{image.filename}</h3>
              
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Secure watermarked version:</p>
                  <img 
                    src={`/api/secure-image/${image.id}?w=400&h=300`}
                    alt={image.alt || 'Watermarked image'}
                    className="w-full border"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    URL: /api/secure-image/{image.id}?w=400&h=300
                  </p>
                </div>
                
                <div>
                  <p className="text-sm text-gray-600 mb-1">Try these sizes:</p>
                  <div className="flex gap-2">
                    <a 
                      href={`/api/secure-image/${image.id}?w=800&h=600`}
                      target="_blank"
                      className="text-blue-500 underline text-sm"
                    >
                      800x600
                    </a>
                    <a 
                      href={`/api/secure-image/${image.id}?w=1200&h=900`}
                      target="_blank"
                      className="text-blue-500 underline text-sm"
                    >
                      1200x900
                    </a>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
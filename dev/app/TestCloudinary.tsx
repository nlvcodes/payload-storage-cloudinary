'use client'

import React, { useEffect, useState } from 'react'
import { fetchSignedURL } from 'payload-storage-cloudinary/client'

export function TestCloudinary({ docId }: { docId: string }) {
  const [tests, setTests] = useState<any>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function runTests() {
      const results: any = {}
      
      try {
        // 1. Get the signed URL
        const signedUrl = await fetchSignedURL('documents', docId)
        results.signedUrl = {
          success: true,
          url: signedUrl,
          urlLength: signedUrl.length
        }
        
        // 2. Parse the URL to check its components
        try {
          const url = new URL(signedUrl)
          results.urlParsing = {
            success: true,
            host: url.host,
            pathname: url.pathname,
            hasToken: url.search.includes('__cld_token__'),
            protocol: url.protocol
          }
        } catch (e) {
          results.urlParsing = { success: false, error: 'Invalid URL format' }
        }
        
        // 3. Try to fetch the image with different methods
        try {
          // Method 1: Basic fetch
          const fetchResponse = await fetch(signedUrl, { 
            method: 'HEAD',
            mode: 'no-cors' 
          })
          results.fetchTest = {
            method: 'HEAD with no-cors',
            type: fetchResponse.type,
            ok: fetchResponse.ok || fetchResponse.type === 'opaque'
          }
        } catch (e) {
          results.fetchTest = { 
            error: e instanceof Error ? e.message : 'Fetch failed' 
          }
        }
        
        // 4. Create a test image and wait for load/error
        results.imageTest = await new Promise((resolve) => {
          const img = new Image()
          img.onload = () => resolve({ 
            success: true, 
            width: img.naturalWidth, 
            height: img.naturalHeight 
          })
          img.onerror = () => resolve({ 
            success: false, 
            error: 'Image load failed' 
          })
          img.src = signedUrl
        })
        
        // 5. Test the original URL from the document
        const docResponse = await fetch(`/api/documents/${docId}`)
        if (docResponse.ok) {
          const doc = await docResponse.json()
          results.documentUrls = {
            url: doc.url,
            cloudinaryUrl: doc.cloudinaryUrl,
            urlsMatch: doc.url === doc.cloudinaryUrl
          }
          
          // Try loading the non-signed URL
          if (doc.url && doc.url !== signedUrl) {
            results.originalUrlTest = await new Promise((resolve) => {
              const img = new Image()
              img.onload = () => resolve({ success: true })
              img.onerror = () => resolve({ success: false })
              img.src = doc.url
            })
          }
        }
        
      } catch (error) {
        results.error = error instanceof Error ? error.message : 'Test failed'
      }
      
      setTests(results)
      setLoading(false)
    }
    
    runTests()
  }, [docId])

  if (loading) return <div>Running Cloudinary tests...</div>

  return (
    <div style={{ 
      backgroundColor: '#e0e7ff', 
      padding: '1rem', 
      borderRadius: '8px', 
      margin: '1rem 0',
      border: '1px solid #6366f1'
    }}>
      <h3>🔬 Cloudinary URL Test Results</h3>
      
      <div style={{ display: 'grid', gap: '1rem' }}>
        {/* Signed URL Test */}
        <div style={{ backgroundColor: 'white', padding: '0.5rem', borderRadius: '4px' }}>
          <h4>1. Signed URL Generation</h4>
          <p>Success: {tests.signedUrl?.success ? '✅' : '❌'}</p>
          <p>URL Length: {tests.signedUrl?.urlLength} characters</p>
        </div>
        
        {/* URL Parsing */}
        <div style={{ backgroundColor: 'white', padding: '0.5rem', borderRadius: '4px' }}>
          <h4>2. URL Structure</h4>
          <p>Valid URL: {tests.urlParsing?.success ? '✅' : '❌'}</p>
          {tests.urlParsing?.success && (
            <>
              <p>Host: {tests.urlParsing.host}</p>
              <p>Has Token: {tests.urlParsing.hasToken ? '✅' : '❌'}</p>
              <p>Protocol: {tests.urlParsing.protocol}</p>
            </>
          )}
        </div>
        
        {/* Fetch Test */}
        <div style={{ backgroundColor: 'white', padding: '0.5rem', borderRadius: '4px' }}>
          <h4>3. Fetch Test</h4>
          <p>Method: {tests.fetchTest?.method}</p>
          <p>Result: {tests.fetchTest?.ok ? '✅ Accessible' : '❌ Not accessible'}</p>
          {tests.fetchTest?.error && <p style={{ color: 'red' }}>Error: {tests.fetchTest.error}</p>}
        </div>
        
        {/* Image Load Test */}
        <div style={{ backgroundColor: 'white', padding: '0.5rem', borderRadius: '4px' }}>
          <h4>4. Image Load Test</h4>
          <p>Success: {tests.imageTest?.success ? '✅' : '❌'}</p>
          {tests.imageTest?.success && (
            <>
              <p>Dimensions: {tests.imageTest.width} x {tests.imageTest.height}</p>
            </>
          )}
          {tests.imageTest?.error && <p style={{ color: 'red' }}>Error: {tests.imageTest.error}</p>}
        </div>
        
        {/* Document URLs */}
        {tests.documentUrls && (
          <div style={{ backgroundColor: 'white', padding: '0.5rem', borderRadius: '4px' }}>
            <h4>5. Document URLs</h4>
            <p>Has URL: {tests.documentUrls.url ? '✅' : '❌'}</p>
            <p>URLs Match: {tests.documentUrls.urlsMatch ? 'Yes' : 'No'}</p>
            {tests.originalUrlTest && (
              <p>Original URL loads: {tests.originalUrlTest.success ? '✅' : '❌'}</p>
            )}
            <details>
              <summary>Show URLs</summary>
              <pre style={{ fontSize: '0.75rem', overflow: 'auto' }}>
                {JSON.stringify(tests.documentUrls, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </div>
      
      {/* Full test results */}
      <details style={{ marginTop: '1rem' }}>
        <summary>Full Test Results</summary>
        <pre style={{ fontSize: '0.75rem', overflow: 'auto' }}>
          {JSON.stringify(tests, null, 2)}
        </pre>
      </details>
    </div>
  )
}
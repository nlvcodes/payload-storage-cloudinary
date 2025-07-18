'use client'

import React, { useEffect, useState } from 'react'

export function DebugAuth({ docId }: { docId: string }) {
  const [debugInfo, setDebugInfo] = useState<any>(null)
  const [endpointTest, setEndpointTest] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function runTests() {
      try {
        // Test server-side auth check
        const response = await fetch(`/api/test-auth?id=${docId}`)
        const data = await response.json()
        setDebugInfo(data)
        
        // Test the endpoint
        const endpointResponse = await fetch('/api/test-endpoint')
        const endpointData = await endpointResponse.json()
        setEndpointTest(endpointData)
        
        // Also test direct client call
        try {
          const directResponse = await fetch(`/api/documents/signed-url/${docId}`, {
            credentials: 'same-origin',
          })
          const directData = await directResponse.json()
          setEndpointTest((prev: any) => ({
            ...prev,
            directCall: {
              status: directResponse.status,
              data: directData
            }
          }))
        } catch (error) {
          setEndpointTest((prev: any) => ({
            ...prev,
            directCall: {
              error: error instanceof Error ? error.message : 'Unknown error'
            }
          }))
        }
      } catch (error) {
        setDebugInfo({ error: error instanceof Error ? error.message : 'Unknown error' })
      } finally {
        setLoading(false)
      }
    }
    runTests()
  }, [docId])

  if (loading) return <div>Running authentication tests...</div>

  return (
    <div style={{ 
      backgroundColor: '#f0f9ff', 
      padding: '1rem', 
      borderRadius: '8px', 
      margin: '1rem 0',
      border: '1px solid #0284c7'
    }}>
      <h3>🔍 Authentication Debug Info</h3>
      <pre style={{ fontSize: '0.875rem', overflow: 'auto' }}>
        {JSON.stringify(debugInfo, null, 2)}
      </pre>
      
      {endpointTest && (
        <>
          <h3>🔗 Endpoint Test Results</h3>
          <pre style={{ fontSize: '0.875rem', overflow: 'auto' }}>
            {JSON.stringify(endpointTest, null, 2)}
          </pre>
        </>
      )}
      
      {debugInfo?.success && (
        <div style={{ marginTop: '1rem' }}>
          <h4>Test Results:</h4>
          <ul>
            <li>✅ Document found: {debugInfo.tests.docWithReq ? 'Yes' : 'No'}</li>
            <li>✅ Is private: {debugInfo.tests.isPrivate ? 'Yes' : 'No'}</li>
            <li>✅ Requires signed URL: {debugInfo.tests.requiresSignedURL ? 'Yes' : 'No'}</li>
            <li>✅ Has Cloudinary ID: {debugInfo.tests.hasCloudinaryPublicId ? 'Yes' : 'No'}</li>
            {debugInfo.tests.signedUrl && (
              <li>✅ Generated signed URL: 
                <details>
                  <summary>Show URL</summary>
                  <pre style={{ fontSize: '0.75rem', overflow: 'auto' }}>{debugInfo.tests.signedUrl}</pre>
                </details>
              </li>
            )}
          </ul>
        </div>
      )}

      <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#fef3c7', borderRadius: '4px' }}>
        <h4>💡 Troubleshooting Tips:</h4>
        <ol style={{ fontSize: '0.875rem' }}>
          <li>Make sure the document with ID <code>{docId}</code> exists in the documents collection</li>
          <li>Check that the document has <code>isPrivate</code> or <code>requiresSignedURL</code> set to true</li>
          <li>Verify the document was uploaded to Cloudinary (has cloudinaryPublicId)</li>
          <li>If using authentication, ensure you're logged in to Payload admin</li>
          <li>Check browser console for CORS or network errors</li>
        </ol>
      </div>
    </div>
  )
}
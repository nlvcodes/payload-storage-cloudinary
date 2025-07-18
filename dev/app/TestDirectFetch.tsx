'use client'

import React, { useEffect, useState } from 'react'

export function TestDirectFetch({ docId }: { docId: string }) {
  const [result, setResult] = useState<any>(null)

  useEffect(() => {
    async function test() {
      try {
        // Test 1: Direct fetch (what works)
        const directResponse = await fetch(`/api/documents/signed-url/${docId}`, {
          credentials: 'same-origin',
        })
        const directData = await directResponse.json()
        
        // Test 2: Using our helper
        const { fetchSignedURL } = await import('payload-storage-cloudinary/client')
        let helperResult = null
        let helperError = null
        
        try {
          helperResult = await fetchSignedURL('documents', docId)
        } catch (error) {
          helperError = error instanceof Error ? error.message : 'Unknown error'
        }
        
        setResult({
          direct: {
            status: directResponse.status,
            url: directData.url,
            works: directResponse.ok
          },
          helper: {
            url: helperResult,
            error: helperError,
            works: !!helperResult
          }
        })
      } catch (error) {
        setResult({ error: error instanceof Error ? error.message : 'Unknown error' })
      }
    }
    test()
  }, [docId])

  if (!result) return <div>Loading test results...</div>

  return (
    <div style={{ 
      backgroundColor: '#ecfdf5', 
      padding: '1rem', 
      borderRadius: '8px', 
      margin: '1rem 0',
      border: '1px solid #10b981'
    }}>
      <h3>🧪 Direct Fetch Test</h3>
      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: '1fr 1fr' }}>
        <div>
          <h4>Direct Fetch (Working)</h4>
          <p>Status: {result.direct?.status}</p>
          <p>Works: {result.direct?.works ? '✅' : '❌'}</p>
          {result.direct?.url && (
            <details>
              <summary>URL</summary>
              <pre style={{ fontSize: '0.75rem', overflow: 'auto' }}>{result.direct.url}</pre>
            </details>
          )}
        </div>
        
        <div>
          <h4>Helper Function</h4>
          <p>Works: {result.helper?.works ? '✅' : '❌'}</p>
          {result.helper?.error && <p style={{ color: 'red' }}>Error: {result.helper.error}</p>}
          {result.helper?.url && (
            <details>
              <summary>URL</summary>
              <pre style={{ fontSize: '0.75rem', overflow: 'auto' }}>{result.helper.url}</pre>
            </details>
          )}
        </div>
      </div>
      
      {result.helper?.url && result.direct?.url && (
        <div style={{ marginTop: '1rem' }}>
          <h4>URLs Match: {result.helper.url === result.direct.url ? '✅' : '❌'}</h4>
        </div>
      )}
    </div>
  )
}
'use client'

import { useState, useEffect } from 'react'

export default function TestAuthAccess() {
  const [authStatus, setAuthStatus] = useState<'checking' | 'authenticated' | 'unauthenticated'>('checking')
  const [testResults, setTestResults] = useState<any>(null)
  const [cookies, setCookies] = useState<string>('')
  const mediaId = '6865e04cd16a3a081a9d811c' // Your private file ID

  useEffect(() => {
    checkAuthStatus()
    // Set cookies on client side only
    if (typeof document !== 'undefined') {
      setCookies(document.cookie || 'None')
    }
  }, [])

  const checkAuthStatus = async () => {
    try {
      const response = await fetch('/api/users/me', {
        credentials: 'same-origin',
      })
      const data = await response.json().catch(() => null)
      console.log('Auth check response:', { status: response.status, ok: response.ok, data })
      
      // Check if there's actually a user object, not just a 200 response
      const hasUser = response.ok && data && data.user && data.user !== null
      setAuthStatus(hasUser ? 'authenticated' : 'unauthenticated')
    } catch (error) {
      console.error('Auth check error:', error)
      setAuthStatus('unauthenticated')
    }
  }

  const testDirectAccess = async () => {
    try {
      // Test 1: Try to access the media directly via API
      const mediaResponse = await fetch(`/api/media/${mediaId}`, {
        credentials: 'same-origin',
      })
      
      // Test 2: Try to get signed URL
      const signedUrlResponse = await fetch(`/api/media/signed-url/${mediaId}`, {
        credentials: 'same-origin',
      })
      
      // Test 3: Try without credentials
      const noCredsResponse = await fetch(`/api/media/signed-url/${mediaId}`, {
        credentials: 'omit',
      })

      setTestResults({
        directAccess: {
          status: mediaResponse.status,
          ok: mediaResponse.ok,
          statusText: mediaResponse.statusText,
        },
        signedUrlWithCreds: {
          status: signedUrlResponse.status,
          ok: signedUrlResponse.ok,
          data: signedUrlResponse.ok ? await signedUrlResponse.json() : null,
        },
        signedUrlNoCreds: {
          status: noCredsResponse.status,
          ok: noCredsResponse.ok,
          error: !noCredsResponse.ok ? await noCredsResponse.json().catch(() => ({})) : null,
        },
      })
    } catch (error) {
      console.error('Test error:', error)
    }
  }

  const logout = async () => {
    try {
      // Clear all cookies
      document.cookie.split(";").forEach((c) => {
        document.cookie = c
          .replace(/^ +/, "")
          .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/")
      })
      
      // Try logout endpoint
      await fetch('/api/users/logout', {
        method: 'POST',
        credentials: 'same-origin',
      })
      
      // Clear storage
      localStorage.clear()
      sessionStorage.clear()
      
      window.location.reload()
    } catch (error) {
      console.error('Logout error:', error)
    }
  }

  return (
    <div className="container mx-auto p-8">
      <h1 className="text-2xl font-bold mb-6">Test Private File Access</h1>
      
      <div className="mb-6 p-4 bg-gray-100 rounded">
        <p className="font-semibold mb-2">Current Status:</p>
        <p>Auth Status: <span className={authStatus === 'authenticated' ? 'text-green-600' : 'text-red-600'}>
          {authStatus}
        </span></p>
        <p>Testing Media ID: {mediaId}</p>
        <p className="text-sm mt-2">Check browser console for detailed auth response</p>
        <p className="text-xs mt-1">Cookies: {cookies}</p>
      </div>

      <div className="space-y-4">
        <button
          onClick={testDirectAccess}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Test Access
        </button>

        {authStatus === 'authenticated' && (
          <button
            onClick={logout}
            className="ml-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Logout to Test Unauthenticated Access
          </button>
        )}
      </div>

      {testResults && (
        <div className="mt-6">
          <h2 className="text-xl font-semibold mb-4">Test Results:</h2>
          
          <div className="space-y-4">
            <div className="p-4 bg-gray-50 rounded">
              <h3 className="font-medium mb-2">Direct Media Access (GET /api/media/{mediaId})</h3>
              <pre className="text-sm bg-white p-2 rounded">
                {JSON.stringify(testResults.directAccess, null, 2)}
              </pre>
            </div>

            <div className="p-4 bg-gray-50 rounded">
              <h3 className="font-medium mb-2">Signed URL with Credentials</h3>
              <pre className="text-sm bg-white p-2 rounded">
                {JSON.stringify(testResults.signedUrlWithCreds, null, 2)}
              </pre>
              {testResults.signedUrlWithCreds?.data?.url && (
                <div className="mt-2">
                  <p className="text-sm mb-1">Preview with signed URL:</p>
                  <img 
                    src={testResults.signedUrlWithCreds.data.url} 
                    alt="Private image via signed URL"
                    className="w-64 h-auto border"
                  />
                </div>
              )}
            </div>

            <div className="p-4 bg-gray-50 rounded">
              <h3 className="font-medium mb-2">Signed URL without Credentials</h3>
              <pre className="text-sm bg-white p-2 rounded">
                {JSON.stringify(testResults.signedUrlNoCreds, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}

      <div className="mt-8 p-4 bg-yellow-50 rounded">
        <h3 className="font-semibold mb-2">Expected Behavior:</h3>
        <ul className="list-disc list-inside space-y-1 text-sm">
          <li><strong>When Authenticated:</strong> You can access private files and get signed URLs</li>
          <li><strong>When Unauthenticated:</strong> Access should be denied (403) or require authentication</li>
          <li>Private files in Cloudinary use signed URLs that expire after 1 hour</li>
          <li>The signed URL includes authentication tokens that allow temporary access</li>
        </ul>
      </div>
    </div>
  )
}
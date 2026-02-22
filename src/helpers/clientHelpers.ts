// Type definitions for React-like environments
interface ReactLike {
  useState: <T>(initial: T | (() => T)) => [T, (value: T) => void]
  useEffect: (effect: () => void | (() => void), deps?: any[]) => void
}

/**
 * Client-side helper to fetch a signed URL for a private image
 * @param collection - The collection slug (e.g., 'media', 'documents')
 * @param docId - The document ID
 * @param options - Optional configuration
 * @returns Promise resolving to the signed Cloudinary URL
 */
export async function fetchSignedURL(
  collection: string,
  docId: string,
  options?: {
    /** Custom API base URL (defaults to current origin) */
    baseUrl?: string
    /** Include credentials in the request (defaults to 'same-origin') */
    credentials?: RequestCredentials
    /** Additional headers to include */
    headers?: Record<string, string>
    /** JWT token for authentication (if not using cookies) */
    token?: string
    /** Cloudinary transformations to apply */
    transformations?: Record<string, any>
  },
): Promise<string> {
  const baseUrl = options?.baseUrl || ''
  let url = `${baseUrl}/api/${collection}/signed-url/${docId}`

  // Add transformations as query parameter if provided
  if (options?.transformations) {
    const params = new URLSearchParams()
    params.set('transformations', JSON.stringify(options.transformations))
    url += `?${params.toString()}`
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers || {}),
  }

  // Add JWT token if provided
  if (options?.token) {
    headers['Authorization'] = `JWT ${options.token}`
  }

  const response = await fetch(url, {
    method: 'GET',
    headers,
    credentials: options?.credentials || 'same-origin',
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Failed to fetch signed URL' }))
    throw new Error(errorData.message || `HTTP ${response.status}: Failed to fetch signed URL`)
  }

  const data = await response.json()
  return data.url
}

/**
 * Batch fetch multiple signed URLs for private images
 * @param collection - The collection slug
 * @param docIds - Array of document IDs
 * @param options - Optional configuration
 * @returns Promise resolving to a map of docId to signed URL
 */
export async function fetchSignedURLs(
  collection: string,
  docIds: string[],
  options?: {
    baseUrl?: string
    credentials?: RequestCredentials
    headers?: Record<string, string>
    token?: string
    /** Cloudinary transformations to apply to all URLs */
    transformations?: Record<string, any>
  },
): Promise<Record<string, string>> {
  const baseUrl = options?.baseUrl || ''
  const url = `${baseUrl}/api/${collection}/signed-urls`

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers || {}),
  }

  if (options?.token) {
    headers['Authorization'] = `JWT ${options.token}`
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    credentials: options?.credentials || 'same-origin',
    body: JSON.stringify({
      ids: docIds,
      transformations: options?.transformations,
    }),
  })

  if (!response.ok) {
    const errorData = await response
      .json()
      .catch(() => ({ message: 'Failed to fetch signed URLs' }))
    throw new Error(errorData.message || `HTTP ${response.status}: Failed to fetch signed URLs`)
  }

  const data = await response.json()

  // Convert results array to a map
  const urlMap: Record<string, string> = {}
  if (data.results) {
    data.results.forEach((result: any) => {
      if (result.url && !result.error) {
        urlMap[result.id] = result.url
      }
    })
  }

  return urlMap
}

/**
 * React hook for fetching a signed URL with automatic refetch before expiry
 * Note: This hook requires React to be available in the global scope
 *
 * @example
 * ```tsx
 * import { useSignedURL } from 'payload-storage-cloudinary'
 *
 * function MyComponent({ doc }) {
 *   const { url, loading, error } = useSignedURL('media', doc.id)
 *   // ...
 * }
 * ```
 */
export function useSignedURL(
  collection: string,
  docId: string | null | undefined,
  options?: {
    /** Refetch buffer in seconds before URL expires (default: 300 = 5 minutes) */
    refetchBuffer?: number
    /** Other fetch options */
    fetchOptions?: Parameters<typeof fetchSignedURL>[2]
    /** React instance (optional, defaults to window.React) */
    react?: ReactLike
    /** Cloudinary transformations to apply */
    transformations?: Record<string, any>
  },
): {
  url: string | null
  loading: boolean
  error: Error | null
} {
  // Return initial state during SSR
  if (typeof window === 'undefined') {
    return {
      url: null,
      loading: true,
      error: null,
    }
  }

  // Get React from options or global
  const React = options?.react || (window as any).React
  if (!React) {
    throw new Error(
      'React is not available. Please ensure React is loaded or pass it via options.react',
    )
  }

  const [url, setUrl] = React.useState(null) as [string | null, (value: string | null) => void]
  const [loading, setLoading] = React.useState(!!docId) as [boolean, (value: boolean) => void]
  const [error, setError] = React.useState(null) as [Error | null, (value: Error | null) => void]

  React.useEffect(() => {
    if (!docId) {
      setUrl(null)
      setLoading(false)
      return
    }

    let timeoutId: NodeJS.Timeout

    const fetchUrl = async () => {
      setLoading(true)
      setError(null)

      try {
        const signedUrl = await fetchSignedURL(collection, docId, {
          ...options?.fetchOptions,
          transformations: options?.transformations,
        })
        setUrl(signedUrl)

        // Schedule refetch before expiry (default 5 minutes before)
        const refetchBuffer = (options?.refetchBuffer || 300) * 1000
        const expiryTime = 3600 * 1000 // 1 hour default expiry
        const refetchDelay = Math.max(expiryTime - refetchBuffer, 60000) // At least 1 minute

        timeoutId = setTimeout(fetchUrl, refetchDelay)
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch signed URL'))
        setUrl(null)
      } finally {
        setLoading(false)
      }
    }

    fetchUrl()

    return () => {
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [collection, docId])

  return { url, loading, error }
}

/**
 * Helper to determine if a document requires a signed URL
 */
export function requiresSignedURL(doc: any): boolean {
  return doc?.requiresSignedURL === true || doc?.isPrivate === true
}

/**
 * Extract transformations from a Cloudinary URL
 */
function extractTransformationsFromUrl(url: string): Record<string, any> | undefined {
  if (!url) return undefined

  // Match the transformation string between /upload/ and /v{version}
  const match = url.match(/\/upload\/([^/]+)\/v\d+/)
  if (!match || !match[1]) return undefined

  const transformString = match[1]
  const transformations: Record<string, any> = {}

  // Parse transformation string (e.g., "c_fill,w_200,h_200,q_auto,f_auto")
  const parts = transformString.split(',')
  for (const part of parts) {
    // Handle special cases that don't follow key_value pattern
    if (part === 'f_auto') {
      transformations.fetch_format = 'auto'
      continue
    }
    if (part === 'q_auto') {
      transformations.quality = 'auto'
      continue
    }
    if (part.startsWith('q_auto:')) {
      transformations.quality = part.replace('q_', '')
      continue
    }
    // Handle effects with parameters (e.g., e_blur:1000, e_pixelate:20)
    if (part.startsWith('e_') && part.includes(':')) {
      transformations.effect = part.replace('e_', '')
      continue
    }

    // Standard key_value pattern
    const underscoreIndex = part.indexOf('_')
    if (underscoreIndex === -1) continue

    const key = part.substring(0, underscoreIndex)
    const value = part.substring(underscoreIndex + 1)

    if (key && value) {
      // Map single letter keys to full names
      switch (key) {
        case 'w':
          transformations.width = isNaN(Number(value)) ? value : Number(value)
          break
        case 'h':
          transformations.height = isNaN(Number(value)) ? value : Number(value)
          break
        case 'c':
          transformations.crop = value
          break
        case 'q':
          transformations.quality = value
          break
        case 'f':
          transformations.fetch_format = value
          break
        case 'g':
          transformations.gravity = value
          break
        case 'dpr':
          transformations.dpr = value
          break
        case 'e':
          transformations.effect = value
          break
        case 'r':
          transformations.radius = value
          break
        case 'a':
          transformations.angle = value
          break
        case 'o':
          transformations.opacity = value
          break
        case 'bo':
          transformations.border = value
          break
        case 'b':
          transformations.background = value
          break
        case 'l':
          transformations.overlay = value
          break
        case 'u':
          transformations.underlay = value
          break
        default:
          transformations[key] = value
      }
    }
  }

  return Object.keys(transformations).length > 0 ? transformations : undefined
}

/**
 * Get the appropriate image URL (signed or regular)
 * @param doc - The document object
 * @param collection - The collection slug
 * @param options - Fetch options
 * @returns Promise resolving to the appropriate URL
 */
export async function getImageURL(
  doc: any,
  collection: string,
  options?: Parameters<typeof fetchSignedURL>[2],
): Promise<string> {
  if (requiresSignedURL(doc)) {
    return fetchSignedURL(collection, doc.id, options)
  }

  // For public files with transformations, apply them client-side
  const baseUrl = doc.url || doc.cloudinaryUrl || ''
  if (options?.transformations && baseUrl) {
    // Extract base URL and apply transformations
    const urlParts = baseUrl.split('/upload/')
    if (urlParts.length === 2) {
      const transformString = Object.entries(options.transformations)
        .map(([key, value]) => `${key}_${value}`)
        .join(',')
      return `${urlParts[0]}/upload/${transformString}/${urlParts[1]}`
    }
  }

  return baseUrl
}

/**
 * Creates a PrivateImage React component
 * A one-stop shop for handling private images with all their URLs
 *
 * @example
 * ```tsx
 * import React from 'react'
 * import { createPrivateImageComponent } from 'payload-storage-cloudinary/client'
 *
 * const PrivateImage = createPrivateImageComponent(React)
 *
 * // Use in your app
 * <PrivateImage doc={doc} collection="media" />
 * ```
 */
export function createPrivateImageComponent(React: any) {
  return function PrivateImage({
    doc,
    collection,
    alt,
    className,
    fallback,
    includeTransformations = false,
    includePublicPreview = true,
    showViewButton = true,
    viewButtonText = 'View Full Image',
    viewButtonClassName = 'absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 text-white',
  }: {
    doc: any
    collection: string
    alt?: string
    className?: string
    fallback?: any
    /** Use the document's transformedUrl instead of url */
    includeTransformations?: boolean
    /** Show public preview for private files */
    includePublicPreview?: boolean
    /** Show view button on public preview */
    showViewButton?: boolean
    /** Text for the view button */
    viewButtonText?: string
    /** Custom class for view button */
    viewButtonClassName?: string
  }) {
    // Early return if no document
    if (!doc) {
      return null
    }

    // State for showing private vs public
    const [showPrivate, setShowPrivate] = React.useState(false)

    // Check if the document actually requires a signed URL
    const needsSignedUrl = requiresSignedURL(doc)

    // For public files, just return the image
    if (!needsSignedUrl) {
      const publicUrl =
        includeTransformations && doc?.transformedUrl
          ? doc.transformedUrl
          : doc?.url || doc?.cloudinaryUrl

      return React.createElement('img', {
        src: publicUrl,
        alt: alt || doc?.alt || '',
        className: className,
        width: doc?.width,
        height: doc?.height,
      })
    }

    // For private files, fetch signed URL
    // If transformations are requested, try to extract them from transformedUrl
    let transformations: Record<string, any> | undefined
    if (includeTransformations && doc?.transformedUrl) {
      transformations = extractTransformationsFromUrl(doc.transformedUrl)
    }

    const {
      url: signedUrl,
      loading,
      error,
    } = useSignedURL(collection, showPrivate ? doc?.id : null, {
      react: React,
      transformations,
    })

    // For private files, we must use the signed URL
    const privateUrl = signedUrl

    // Get public preview URL
    const publicPreviewUrl =
      includeTransformations && doc?.previewUrl
        ? doc.previewUrl // previewUrl combines transformations with watermark/blur
        : doc?.publicTransformationURL || doc?.thumbnailURL

    // Show public preview if available and not showing private
    if (!showPrivate && includePublicPreview && publicPreviewUrl) {
      return React.createElement('div', { className: 'relative' }, [
        React.createElement('img', {
          key: 'preview',
          src: publicPreviewUrl,
          alt: alt || doc?.alt || '',
          className: className,
          width: doc?.width,
          height: doc?.height,
        }),
        showViewButton &&
          React.createElement('button', {
            key: 'button',
            onClick: () => setShowPrivate(true),
            className: viewButtonClassName,
            children: viewButtonText,
          }),
      ])
    }

    // Loading state
    if (loading && showPrivate) {
      return fallback || React.createElement('div', { className }, 'Loading...')
    }

    // Error state
    if (error && showPrivate) {
      return React.createElement('div', { className }, `Error: ${error.message}`)
    }

    // No URL available
    if (!privateUrl && showPrivate) {
      return React.createElement('div', { className }, 'Image not available')
    }

    // Show the private image
    if (showPrivate && privateUrl) {
      return React.createElement('img', {
        src: privateUrl,
        alt: alt || doc?.alt || '',
        className: className,
        width: doc?.width,
        height: doc?.height,
      })
    }

    // Fallback
    return null
  }
}

/**
 * Creates a PremiumImage React component
 * Handles authentication flow with automatic fallback to public preview
 *
 * @example
 * ```tsx
 * const PremiumImage = createPremiumImageComponent(React)
 *
 * <PremiumImage
 *   doc={doc}
 *   collection="media"
 *   isAuthenticated={!!user}
 * />
 * ```
 */
export function createPremiumImageComponent(React: any) {
  return function PremiumImage({
    doc,
    collection,
    isAuthenticated = false,
    alt,
    className,
    fallback,
    includeTransformations = true,
    loadingComponent,
    errorComponent,
    unauthorizedComponent,
    unauthorizedMessage = 'Please log in to view full quality',
    showUpgradePrompt = true,
    onUpgradeClick,
  }: {
    doc: any
    collection: string
    /** Whether the user is authenticated */
    isAuthenticated?: boolean
    alt?: string
    className?: string
    fallback?: any
    /** Use transformed URLs when available */
    includeTransformations?: boolean
    /** Custom loading component */
    loadingComponent?: any
    /** Custom error component */
    errorComponent?: any
    /** Custom unauthorized component */
    unauthorizedComponent?: any
    /** Message for unauthorized users */
    unauthorizedMessage?: string
    /** Show upgrade prompt on preview */
    showUpgradePrompt?: boolean
    /** Callback when upgrade is clicked */
    onUpgradeClick?: () => void
  }) {
    // Early return if no document
    if (!doc) {
      return null
    }

    const needsSignedUrl = requiresSignedURL(doc)

    // For public files, just show them
    if (!needsSignedUrl) {
      const url =
        includeTransformations && doc?.transformedUrl
          ? doc.transformedUrl
          : doc?.url || doc?.cloudinaryUrl

      return React.createElement('img', {
        src: url,
        alt: alt || doc?.alt || '',
        className: className,
        width: doc?.width,
        height: doc?.height,
      })
    }

    // For private files, check authentication
    if (!isAuthenticated) {
      // Show public preview if available
      const previewUrl =
        includeTransformations && doc?.previewUrl
          ? doc.previewUrl
          : doc?.publicTransformationURL || doc?.thumbnailURL

      if (previewUrl) {
        return React.createElement('div', { className: 'relative' }, [
          React.createElement('img', {
            key: 'preview',
            src: previewUrl,
            alt: alt || doc?.alt || '',
            className: className,
            width: doc?.width,
            height: doc?.height,
          }),
          showUpgradePrompt &&
            React.createElement(
              'div',
              {
                key: 'overlay',
                className:
                  'absolute inset-0 flex items-center justify-center bg-black bg-opacity-50',
              },
              unauthorizedComponent ||
                React.createElement(
                  'div',
                  {
                    className: 'text-center text-white p-4',
                  },
                  [
                    React.createElement(
                      'p',
                      { key: 'message', className: 'mb-2' },
                      unauthorizedMessage,
                    ),
                    onUpgradeClick &&
                      React.createElement(
                        'button',
                        {
                          key: 'button',
                          onClick: onUpgradeClick,
                          className: 'px-4 py-2 bg-white text-black rounded hover:bg-gray-100',
                        },
                        'Upgrade to Premium',
                      ),
                  ],
                ),
            ),
        ])
      }

      // No preview available
      return (
        unauthorizedComponent ||
        React.createElement(
          'div',
          {
            className: className || 'bg-gray-200 flex items-center justify-center p-8',
          },
          unauthorizedMessage,
        )
      )
    }

    // User is authenticated - fetch signed URL with optional transformations
    // If transformations are requested, try to extract them from transformedUrl
    let transformations: Record<string, any> | undefined
    if (includeTransformations && doc?.transformedUrl) {
      transformations = extractTransformationsFromUrl(doc.transformedUrl)
    }

    const {
      url: signedUrl,
      loading,
      error,
    } = useSignedURL(collection, doc?.id, {
      react: React,
      transformations,
    })

    if (loading) {
      return (
        loadingComponent ||
        fallback ||
        React.createElement('div', { className }, 'Loading premium content...')
      )
    }

    if (error) {
      return errorComponent || React.createElement('div', { className }, `Error: ${error.message}`)
    }

    // Must use the signed URL for private files
    const finalUrl = signedUrl

    if (!finalUrl) {
      return React.createElement('div', { className }, 'Image not available')
    }

    return React.createElement('img', {
      src: finalUrl,
      alt: alt || doc?.alt || '',
      className: className,
      width: doc?.width,
      height: doc?.height,
    })
  }
}

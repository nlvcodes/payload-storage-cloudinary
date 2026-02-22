/**
 * Server-side helpers for generating signed URLs
 * These functions can be used in server components, API routes, and Node.js environments
 */

import { generateSignedURL as generateCloudinarySignedURL } from './signedURLs.js'
import type { Payload, PayloadRequest } from 'payload'
import type { SignedURLConfig } from '../types.js'
import { normalizeCollectionConfig, getSignedURLConfig } from './normalizeConfig.js'

export interface ServerSignedURLOptions {
  /** The Payload instance */
  payload: Payload
  /** The collection slug */
  collection: string
  /** The document ID */
  docId: string
  /** Optional user for access control */
  user?: PayloadRequest['user']
  /** Cloudinary transformations to apply */
  transformations?: Record<string, any>
  /** Plugin options (from your cloudinaryStorage config) */
  pluginOptions?: any
}

/**
 * Server-side function to generate a signed URL with transformations
 * Use this in server components, API routes, or Node.js environments
 */
export async function getSignedURL({
  payload,
  collection,
  docId,
  user,
  transformations,
  pluginOptions,
}: ServerSignedURLOptions): Promise<string | null> {
  try {
    // Fetch the document with access control
    const doc = await payload.findByID({
      collection,
      id: docId,
      user, // Pass user for access control
      depth: 0,
    })

    if (!doc) {
      throw new Error('Document not found')
    }

    // Check if this file requires signed URLs
    if (!doc.requiresSignedURL && !doc.isPrivate) {
      // Public file - apply transformations directly to URL if provided
      const baseUrl = doc.url || doc.cloudinaryUrl
      if (transformations && baseUrl) {
        return applyTransformationsToUrl(baseUrl, transformations)
      }
      return baseUrl
    }

    // Get collection config if available
    let signedURLConfig: SignedURLConfig | undefined
    if (pluginOptions?.collections?.[collection]) {
      const collectionConfig = pluginOptions.collections[collection]
      const rawConfig = typeof collectionConfig === 'boolean' ? {} : collectionConfig
      const config = normalizeCollectionConfig(rawConfig)
      signedURLConfig = getSignedURLConfig(config)
    }

    // Generate signed URL with transformations
    return generateCloudinarySignedURL(
      {
        publicId: doc.cloudinaryPublicId,
        version: doc.cloudinaryVersion,
        resourceType: doc.cloudinaryResourceType || 'image',
        format: doc.cloudinaryFormat,
        transformations,
        expiresIn: signedURLConfig?.expiresIn,
      },
      signedURLConfig,
    )
  } catch (error) {
    console.error('Failed to generate signed URL:', error)
    return null
  }
}

/**
 * Batch generate signed URLs on the server
 */
export async function getSignedURLs({
  payload,
  collection,
  docIds,
  user,
  transformations,
  pluginOptions,
}: Omit<ServerSignedURLOptions, 'docId'> & { docIds: string[] }): Promise<
  Record<string, string | null>
> {
  const results: Record<string, string | null> = {}

  // Process in parallel for better performance — individual failures return null
  await Promise.all(
    docIds.map(async (docId) => {
      const url = await getSignedURL({
        payload,
        collection,
        docId,
        user,
        transformations,
        pluginOptions,
      }).catch(() => null)
      results[docId] = url
    }),
  )

  return results
}

/**
 * Apply transformations to a Cloudinary URL
 * Works with both authenticated and public URLs
 */
export function applyTransformationsToUrl(
  url: string,
  transformations: Record<string, any>,
): string {
  // Parse the URL to identify Cloudinary structure
  const urlParts = url.split('/upload/')
  if (urlParts.length !== 2) {
    // Not a standard Cloudinary URL, return as-is
    return url
  }

  // Build transformation string
  const transformString = Object.entries(transformations)
    .map(([key, value]) => {
      // Handle special cases
      if (key === 'width') key = 'w'
      if (key === 'height') key = 'h'
      if (key === 'crop') key = 'c'
      if (key === 'quality') key = 'q'
      if (key === 'format') key = 'f'
      if (key === 'gravity') key = 'g'
      if (key === 'radius') key = 'r'
      if (key === 'angle') key = 'a'
      if (key === 'opacity') key = 'o'
      if (key === 'border') key = 'bo'
      if (key === 'background') key = 'b'
      if (key === 'overlay') key = 'l'
      if (key === 'underlay') key = 'u'
      if (key === 'fetch_format') key = 'f_auto'

      // Handle special values
      if (key === 'f_auto') return 'f_auto'
      if (key === 'q' && value === 'auto') return 'q_auto'
      if (key === 'q' && value === 'auto:best') return 'q_auto:best'
      if (key === 'q' && value === 'auto:good') return 'q_auto:good'
      if (key === 'q' && value === 'auto:eco') return 'q_auto:eco'
      if (key === 'q' && value === 'auto:low') return 'q_auto:low'

      return `${key}_${value}`
    })
    .join(',')

  // Check if URL already has transformations
  const [baseUrl, resourcePath] = urlParts

  // For authenticated URLs, we need to insert transformations after the auth token
  if (resourcePath.includes('/authenticated/')) {
    // Pattern: authenticated/s--TOKEN--/TRANSFORMATIONS/VERSION/PUBLIC_ID
    const authParts = resourcePath.split('/')
    if (authParts.length >= 3 && authParts[0] === 'authenticated') {
      // Insert transformations after the auth token
      authParts.splice(2, 0, transformString)
      return `${baseUrl}/upload/${authParts.join('/')}`
    }
  }

  // For public URLs, insert transformations at the beginning
  return `${baseUrl}/upload/${transformString}/${resourcePath}`
}

/**
 * Check if a document requires a signed URL
 * Helper for server-side rendering decisions
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
 * Server-side helper to get the appropriate image URL
 * Handles both public and private files with optional transformations
 */
export async function getImageURL(
  doc: any,
  options?: {
    payload?: Payload
    collection?: string
    user?: any
    transformations?: Record<string, any>
    pluginOptions?: any
  },
): Promise<string | null> {
  // If it's a private file and we have payload instance, generate signed URL
  if (requiresSignedURL(doc) && options?.payload && options?.collection) {
    return getSignedURL({
      payload: options.payload,
      collection: options.collection,
      docId: doc.id,
      user: options.user,
      transformations: options.transformations,
      pluginOptions: options.pluginOptions,
    })
  }

  // Public file - apply transformations if provided
  const baseUrl = doc?.url || doc?.cloudinaryUrl
  if (!baseUrl) return null

  if (options?.transformations) {
    return applyTransformationsToUrl(baseUrl, options.transformations)
  }

  return baseUrl
}

/**
 * Server-side helper to get the appropriate private image URL
 * Mirrors the client-side PrivateImage component logic
 */
export async function getPrivateImageURL(
  doc: any,
  options: {
    payload: Payload
    collection: string
    user?: any
    includeTransformations?: boolean
    pluginOptions?: any
  },
): Promise<string | null> {
  if (!doc) return null

  const needsSignedUrl = requiresSignedURL(doc)

  // For public files, return the appropriate URL
  if (!needsSignedUrl) {
    return options.includeTransformations && doc?.transformedUrl
      ? doc.transformedUrl
      : doc?.url || doc?.cloudinaryUrl
  }

  // For private files, generate signed URL with optional transformations
  // Extract transformations from transformedUrl if requested
  let transformations: Record<string, any> | undefined
  if (options.includeTransformations && doc?.transformedUrl) {
    transformations = extractTransformationsFromUrl(doc.transformedUrl)
  }

  const signedUrl = await getSignedURL({
    payload: options.payload,
    collection: options.collection,
    docId: doc.id,
    user: options.user,
    transformations,
    pluginOptions: options.pluginOptions,
  })

  // Always return the signed URL for private files
  return signedUrl
}

/**
 * Server-side helper to get public preview URL
 */
export function getPublicPreviewURL(
  doc: any,
  includeTransformations: boolean = false,
): string | null {
  if (!doc) return null

  return includeTransformations && doc?.previewUrl
    ? doc.previewUrl
    : doc?.publicTransformationURL || doc?.thumbnailURL
}

/**
 * Server-side helper for premium image logic
 * Returns appropriate URL based on authentication status
 */
export async function getPremiumImageURL(
  doc: any,
  options: {
    payload: Payload
    collection: string
    user?: any
    isAuthenticated: boolean
    includeTransformations?: boolean
    pluginOptions?: any
  },
): Promise<{
  url: string | null
  isPreview: boolean
  requiresAuth: boolean
}> {
  if (!doc) {
    return { url: null, isPreview: false, requiresAuth: false }
  }

  const needsSignedUrl = requiresSignedURL(doc)

  // For public files, just return the URL
  if (!needsSignedUrl) {
    const url =
      options.includeTransformations && doc?.transformedUrl
        ? doc.transformedUrl
        : doc?.url || doc?.cloudinaryUrl

    return { url, isPreview: false, requiresAuth: false }
  }

  // For private files, check authentication
  if (!options.isAuthenticated) {
    // Return public preview
    const previewUrl = getPublicPreviewURL(doc, options.includeTransformations)
    return { url: previewUrl, isPreview: true, requiresAuth: true }
  }

  // User is authenticated - get signed URL with optional transformations
  // Extract transformations from transformedUrl if requested
  let transformations: Record<string, any> | undefined
  if (options.includeTransformations && doc?.transformedUrl) {
    transformations = extractTransformationsFromUrl(doc.transformedUrl)
  }

  const signedUrl = await getSignedURL({
    payload: options.payload,
    collection: options.collection,
    docId: doc.id,
    user: options.user,
    transformations,
    pluginOptions: options.pluginOptions,
  })

  // Always use signed URL for private files
  const finalUrl = signedUrl || doc?.url

  return { url: finalUrl, isPreview: false, requiresAuth: true }
}

/**
 * Server-side helpers for generating signed URLs
 * These functions can be used in server components, API routes, and Node.js environments
 *
 * Every helper that takes `payload` looks the document up with the collection's `read` access
 * enforced, then applies the access rule (see accessRule.ts) to the document as stored. Access
 * resolves against `req`, else `user`, else an anonymous caller. Only an explicit
 * `overrideAccess: true` skips both, for trusted server jobs. No helper falls back to a stored
 * URL or to the thumbnail.
 *
 * Every helper that takes caller `transformations` checks them against the allowlist the
 * signed-URL endpoints use (see endpointTransformations.ts) before it looks anything up. A
 * transformation outside it throws, and nothing is signed. Only an explicit
 * `overrideTransformationAllowlist: true` signs any transformation, for trusted server code.
 */

import { generateSignedURL as generateCloudinarySignedURL } from './signedURLs.js'
import { APIError, createLocalReq, type Payload, type PayloadRequest } from 'payload'
import type { CloudinaryCollectionConfig } from '../types.js'
import {
  normalizeCollectionConfig,
  getSignedURLConfig,
  getTransformationConfig,
} from './normalizeConfig.js'
import { buildDeliveryURL, deliveryAssetOf, type DeliveryAsset } from './deliveryURL.js'
import { pluginConfigOf, resolveViewsAccess, type FileAccess } from './accessRule.js'
import { selectedTransformations } from './transformations.js'
import { isDocumentID, readStoredDocument, type StoredDocument } from './storedDocument.js'
import { checkTransformations } from './endpointTransformations.js'

/** The `pluginOptions` argument the helpers took before they read the installed plugin's config. */
export type DeprecatedPluginOptions = {
  /** @deprecated Ignored. The helpers read the collection's config from the installed plugin. */
  pluginOptions?: any
}

/** Which caller transformations a helper signs. */
export type ServerTransformationOptions = {
  /**
   * Cloudinary transformations to sign into the URL. Without `overrideTransformationAllowlist`,
   * only the keys the signed-URL endpoints accept (`width`, `height`, `crop`, `gravity`,
   * `quality`, `fetch_format`, `dpr`, `aspect_ratio`), each a number or a short token of letters,
   * digits, `_` and `.`. Anything else throws a 400 `APIError`, and the helper signs nothing.
   */
  transformations?: Record<string, any>
  /**
   * `true` signs any `transformations`, skipping the allowlist: an `overlay` such as a watermark,
   * an `effect`, a named `transformation`. Only for transformations built in trusted server code.
   * Never pass values from a request with it: an `overlay` or `underlay` can name another private
   * asset (`l_authenticated:<public id>`), and the signed URL would show it. It does not skip
   * access; `overrideAccess` does that.
   */
  overrideTransformationAllowlist?: boolean
}

export interface ServerSignedURLOptions
  extends DeprecatedPluginOptions,
    ServerTransformationOptions {
  /** The Payload instance */
  payload: Payload
  /** The collection slug */
  collection: string
  /** The document ID */
  docId: string | number
  /** The request to resolve access against. Pass it whenever you have one. */
  req?: PayloadRequest
  /** The user to resolve access against, when you have no `req`. With neither, the caller is anonymous. */
  user?: PayloadRequest['user']
  /**
   * Skips the collection's `read` access and the access rule. Only for trusted server jobs, such
   * as a sitemap or an email render, that must get a URL with no reader.
   */
  overrideAccess?: boolean
}

/** Whose access a helper resolves: `req`, else `user`, else an anonymous caller. */
export type ServerAccessOptions = Pick<ServerSignedURLOptions, 'req' | 'user' | 'overrideAccess'>

type LookupOptions = Pick<ServerSignedURLOptions, 'payload' | 'collection' | 'docId'> &
  ServerAccessOptions

/** A document as this reader may see it. `public` is an asset any reader of the document gets. */
interface ReadableFile {
  /** The document as the reader's lookup returned it, with the URLs the read path built for them. */
  doc: any
  /** The document as stored. The access rule decided on it, and every URL is built from it. */
  stored: StoredDocument
  asset: DeliveryAsset
  access: FileAccess | 'public'
  config: CloudinaryCollectionConfig
}

/**
 * Looks the document up as the reader and decides what they may get. Returns null when the
 * reader can't read the document or it has no Cloudinary asset.
 *
 * The lookup only decides whether the reader may read the document. Field `read` access, depth
 * and hooks shape what it returns, so the access rule decides on the stored document instead,
 * the same one the read path gives `customAuthCheck`.
 */
async function readFile({
  payload,
  collection,
  docId,
  req,
  user,
  overrideAccess = false,
}: LookupOptions): Promise<ReadableFile | null> {
  try {
    const lookupReq = req ?? (await createLocalReq({ user: user ?? undefined }, payload))
    // The Local API skips access unless overrideAccess is false, even with req or user
    const doc = await payload.findByID({
      collection,
      id: docId,
      req: lookupReq,
      overrideAccess,
      depth: 0,
    })

    // In every locale. A stored read that fails throws, so the helper returns null.
    const read = doc && (await readStoredDocument(lookupReq, collection, doc.id))
    if (!read) return null
    const stored = read.doc

    const asset = deliveryAssetOf(stored)
    if (!asset.publicId) return null

    const config = normalizeCollectionConfig(pluginConfigOf(payload, collection))
    if (!needsSignedURL(stored, asset)) return { doc, stored, asset, access: 'public', config }

    // Payload ran `read` for this reader. The access rule decides between original and preview.
    // The opt-in is a trusted server job, so it skips the rule too.
    const access = overrideAccess
      ? 'original'
      : await resolveViewsAccess(lookupReq, read.views, config)
    return { doc, stored, asset, access, config }
  } catch (error) {
    // A refused lookup (Forbidden or NotFound) is an access decision, not a failure
    if (!isAccessRefusal(error)) console.error('Failed to read the file:', error)
    return null
  }
}

const isAccessRefusal = (error: unknown) =>
  error instanceof APIError && (error.status === 403 || error.status === 404)

// An authenticated asset needs a signature even when the document is no longer marked private
const needsSignedURL = (doc: any, asset: DeliveryAsset) =>
  requiresSignedURL(doc) || asset.deliveryType === 'authenticated'

/** The URL of the file itself, or null when the reader may not have it. */
function originalURL(file: ReadableFile, transformations?: Record<string, any>): string | null {
  if (file.access === 'public') {
    return buildDeliveryURL(file.asset, { transformation: transformations })
  }
  if (file.access !== 'original') return null
  return generateCloudinarySignedURL(
    { ...file.asset, transformations },
    getSignedURLConfig(file.config),
  )
}

/**
 * The caller's transformations a helper may sign. Throws, before any lookup, when they break the
 * endpoints' allowlist and the caller did not pass `overrideTransformationAllowlist: true`. The
 * error names the rule, never the asset or a URL.
 */
function transformationsToSign({
  transformations,
  overrideTransformationAllowlist,
}: ServerTransformationOptions): Record<string, any> | undefined {
  if (overrideTransformationAllowlist === true) return transformations ?? undefined
  const checked = checkTransformations(transformations)
  if (!checked.ok) {
    throw new APIError(`Refused the transformations. ${checked.error}`, 400, null, true)
  }
  return checked.transformations
}

// The collection's default transformations and the document's selected presets, if any
const transformationsOf = (file: ReadableFile) =>
  selectedTransformations(file.stored, getTransformationConfig(file.config))

/**
 * Server-side function to generate a signed URL with transformations
 * Use this in server components, API routes, or Node.js environments
 *
 * Returns null when the reader may not have the file itself, a preview-only reader included.
 * Throws when `transformations` break the allowlist (see `ServerTransformationOptions`).
 */
export async function getSignedURL({
  transformations,
  overrideTransformationAllowlist,
  ...lookup
}: ServerSignedURLOptions): Promise<string | null> {
  const toSign = transformationsToSign({ transformations, overrideTransformationAllowlist })
  const file = await readFile(lookup)
  return file && originalURL(file, toSign)
}

/** The arguments of `isAccessAllowedByID`: the reader's request, and the document to decide on. */
export interface IsAccessAllowedByIDArgs {
  /** The reader's request. Access resolves against its user and locale. */
  req: PayloadRequest
  /** The collection slug */
  collection: string
  /** The document ID */
  id: number | string
}

/**
 * Whether this reader may get the document's file itself, decided exactly as the plugin decides
 * it for `getSignedURL`, the signed-URL endpoints and every read. It returns `true` exactly when
 * `getSignedURL` returns a URL for the same reader and document.
 *
 * It looks the document up with the collection's `read` access enforced, reads it as stored, and
 * runs the access rule (`customAuthCheck` and `publicTransformation`) on it in every configured
 * locale, whatever locale `req` asks for. It is `false` when the reader may not read the
 * document, when there is no such document or it has no Cloudinary file, when any locale
 * refuses the original, a preview-only reader included, and when the stored read fails. A file
 * that isn't private is `true` for any reader of the document. It has no `overrideAccess`.
 */
export async function isAccessAllowedByID({
  req,
  collection,
  id,
}: IsAccessAllowedByIDArgs): Promise<boolean> {
  if (!req?.payload || typeof collection !== 'string' || !isDocumentID(id) || id === '') {
    throw new TypeError('isAccessAllowedByID takes { req, collection, id }')
  }
  const file = await readFile({ payload: req.payload, collection, docId: id, req })
  return file?.access === 'original' || file?.access === 'public'
}

/**
 * Batch generate signed URLs on the server
 *
 * Keys the result by `String(docId)`. An ID the reader may not have maps to null. Throws, for
 * the whole batch, when `transformations` break the allowlist.
 */
export async function getSignedURLs({
  payload,
  collection,
  docIds,
  req,
  user,
  overrideAccess,
  transformations,
  overrideTransformationAllowlist,
}: Omit<ServerSignedURLOptions, 'docId'> & { docIds: Array<string | number> }): Promise<
  Record<string, string | null>
> {
  // Checked once, before any lookup, so a refusal throws instead of mapping every ID to null
  const toSign = transformationsToSign({ transformations, overrideTransformationAllowlist })
  const results: Record<string, string | null> = {}

  // Process in parallel for better performance. A failed lookup maps to null.
  await Promise.all(
    docIds.map(async (docId) => {
      const url = await getSignedURL({
        payload,
        collection,
        docId,
        req,
        user,
        overrideAccess,
        transformations: toSign,
        overrideTransformationAllowlist,
      }).catch(() => null)
      results[String(docId)] = url
    }),
  )

  return results
}

/**
 * Apply transformations to a Cloudinary URL
 *
 * @deprecated Splices the transformations into the URL string. On a signed `authenticated` URL
 * that breaks the signature, so Cloudinary answers 401. Pass `transformations` to `getSignedURL`
 * or `getServerImageURL` instead, which build the URL through the URL builder.
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
 * Server-side helper to get the appropriate image URL
 * Handles both public and private files with optional transformations
 *
 * A private file needs `payload` and `collection`, so access can be checked. Without them, it
 * gets no URL. A public file with no `payload` gets a URL built from its stored asset.
 * Throws when `transformations` break the allowlist (see `ServerTransformationOptions`), for a
 * public file too.
 */
export async function getImageURL(
  doc: any,
  options?: ServerAccessOptions &
    DeprecatedPluginOptions &
    ServerTransformationOptions & {
      payload?: Payload
      collection?: string
    },
): Promise<string | null> {
  if (!doc) return null
  const transformations = transformationsToSign(options ?? {})

  if (options?.payload && options?.collection) {
    return getSignedURL({
      payload: options.payload,
      collection: options.collection,
      docId: doc.id,
      req: options.req,
      user: options.user,
      overrideAccess: options.overrideAccess,
      transformations,
      overrideTransformationAllowlist: options.overrideTransformationAllowlist,
    })
  }

  const asset = deliveryAssetOf(doc)
  if (!asset.publicId || needsSignedURL(doc, asset)) return null
  return buildDeliveryURL(asset, { transformation: transformations })
}

/**
 * Server-side helper to get the appropriate private image URL
 * Mirrors the client-side PrivateImage component logic
 *
 * With `includeTransformations`, applies the collection's default transformations and the
 * document's selected presets. Returns null when the reader may not have the file itself.
 */
export async function getPrivateImageURL(
  doc: any,
  options: ServerAccessOptions &
    DeprecatedPluginOptions & {
      payload: Payload
      collection: string
      includeTransformations?: boolean
    },
): Promise<string | null> {
  if (!doc) return null

  const file = await readFile({ ...options, docId: doc.id })
  if (!file) return null

  return originalURL(file, options.includeTransformations ? transformationsOf(file) : undefined)
}

/**
 * Server-side helper to get public preview URL
 *
 * Returns the watermarked or blurred `previewUrl` of a document read as the viewer, or null.
 * Never returns the thumbnail, which isn't watermarked.
 */
export function getPublicPreviewURL(
  doc: any,
  /** @deprecated Ignored. `previewUrl` already carries the selected presets. */
  _includeTransformations: boolean = false,
): string | null {
  return doc?.previewUrl || null
}

/**
 * Server-side helper for premium image logic
 * Returns appropriate URL based on authentication status
 *
 * The access rule decides: a reader allowed the original gets it, a preview-only reader gets the
 * preview from their own read, and anyone else gets no URL, not even a stored `previewUrl`. With
 * `isAuthenticated: false`, a reader allowed the original gets the preview only.
 */
export async function getPremiumImageURL(
  doc: any,
  options: ServerAccessOptions &
    DeprecatedPluginOptions & {
      payload: Payload
      collection: string
      isAuthenticated: boolean
      includeTransformations?: boolean
    },
): Promise<{
  url: string | null
  isPreview: boolean
  requiresAuth: boolean
}> {
  if (!doc) {
    return { url: null, isPreview: false, requiresAuth: false }
  }

  const file = await readFile({ ...options, docId: doc.id })
  if (!file) {
    return { url: null, isPreview: false, requiresAuth: true }
  }

  const transformations = options.includeTransformations ? transformationsOf(file) : undefined

  if (file.access === 'public') {
    return { url: originalURL(file, transformations), isPreview: false, requiresAuth: false }
  }

  if (file.access === 'original' && options.isAuthenticated) {
    return { url: originalURL(file, transformations), isPreview: false, requiresAuth: true }
  }

  // A stored `previewUrl` from an older version isn't this reader's to have
  if (file.access === 'none') {
    return { url: null, isPreview: false, requiresAuth: true }
  }

  // The read path built the preview for this reader, or left it out
  return { url: getPublicPreviewURL(file.doc), isPreview: true, requiresAuth: true }
}

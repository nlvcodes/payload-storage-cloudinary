import { APIError, type Endpoint, type PayloadRequest } from 'payload'
import { generateSignedURL, generateDownloadURL } from '../helpers/signedURLs.js'
import { resolveViewsAccess } from '../helpers/accessRule.js'
import { readStoredDocuments, type StoredRead } from '../helpers/storedDocument.js'
import type { CloudinaryStorageOptions } from '../types.js'
import { deliveryAssetOf } from '../helpers/deliveryURL.js'
import { normalizeCollectionConfig, getSignedURLConfig } from '../helpers/normalizeConfig.js'
import {
  checkTransformations,
  transformationsFromQuery,
} from '../helpers/endpointTransformations.js'

/**
 * The most document IDs one batch request may ask for. A larger list is refused before any
 * database query, so a caller can't make the endpoint build one huge `in` query.
 */
export const MAX_BATCH_IDS = 100

const ERRORS = {
  403: 'Access denied',
  404: 'Document not found',
} as const

type AccessStatus = keyof typeof ERRORS

/**
 * The Local API skips access control unless overrideAccess is false, even with req, so every
 * lookup here passes both.
 *
 * The status Payload chose for a refused lookup: Forbidden (403) when `read` access denies,
 * NotFound (404) when the document is missing or outside a query-based `read`.
 * Any other error is not an access decision, so it returns undefined.
 */
const accessErrorStatus = (error: unknown): AccessStatus | undefined =>
  error instanceof APIError && (error.status === 403 || error.status === 404)
    ? error.status
    : undefined

/**
 * Reads the stored documents the rule decides on. 'refused' when it can't read or flatten them:
 * an endpoint that can't decide refuses, so it fails closed.
 */
async function readStoredOrRefuse(
  req: PayloadRequest,
  collection: string,
  ids: Array<number | string>,
): Promise<Map<string, StoredRead> | 'refused'> {
  try {
    return await readStoredDocuments(req, collection, ids)
  } catch (error) {
    req.payload.logger.error({ err: error, msg: 'Could not read the stored document' })
    return 'refused'
  }
}

export const createSignedURLEndpoint = (
  collectionSlug: string,
  options: CloudinaryStorageOptions,
): Endpoint => ({
  path: '/signed-url/:id',
  method: 'get',
  handler: async (req) => {
    const id = req.routeParams?.id as string | undefined

    if (!id) {
      return Response.json({ error: 'Document ID required' }, { status: 400 })
    }

    // Checked before the lookup, so a refused request signs nothing and reads nothing
    const checked = transformationsFromQuery(req.query?.transformations)
    if (!checked.ok) {
      return Response.json({ error: checked.error }, { status: 400 })
    }
    const { transformations } = checked

    try {
      // Payload runs the collection's read access and throws Forbidden or NotFound
      const readable = await req.payload.findByID({
        collection: collectionSlug,
        id,
        req,
        overrideAccess: false,
      })

      // The access rule decides, and the URL is built, on the document as stored, in every
      // locale. A stored read that fails refuses, so the endpoint fails closed.
      const stored = readable && (await readStoredOrRefuse(req, collectionSlug, [readable.id]))
      if (stored === 'refused') {
        return Response.json({ error: ERRORS[403] }, { status: 403 })
      }
      const read = readable && stored?.get(String(readable.id))
      if (!read) {
        return Response.json({ error: ERRORS[404] }, { status: 404 })
      }
      const doc = read.doc

      // Check if this file requires signed URLs
      if (!doc.requiresSignedURL) {
        return Response.json(
          {
            error: 'This file does not require signed URLs',
            url: readable.url,
          },
          { status: 400 },
        )
      }

      // Get collection config
      const collectionConfig = options.collections[collectionSlug]
      const rawConfig = typeof collectionConfig === 'boolean' ? {} : collectionConfig
      const config = normalizeCollectionConfig(rawConfig)
      const signedURLConfig = getSignedURLConfig(config)

      if (!signedURLConfig) {
        return Response.json(
          { error: 'Signed URLs not configured for this collection' },
          { status: 500 },
        )
      }

      // Only a reader with the original gets a URL here. A preview reader gets the preview from
      // the read path, so the endpoint can't sign a caller's transformations for them.
      if ((await resolveViewsAccess(req, read.views, config)) !== 'original') {
        return Response.json({ error: ERRORS[403] }, { status: 403 })
      }

      // For authenticated uploads, we need to generate a new signed URL with transformations
      const asset = deliveryAssetOf(doc)
      const signedUrl = generateSignedURL({ ...asset, transformations }, signedURLConfig)

      // Also generate download URL if requested
      let downloadUrl
      if (req.query?.download === 'true') {
        downloadUrl = generateDownloadURL(asset.publicId, doc.filename, asset)
      }

      // Signed URLs don't expire, so the response carries no expiry
      return Response.json({
        url: signedUrl,
        downloadUrl,
        transformations,
      })
    } catch (error) {
      const status = accessErrorStatus(error)
      if (status) {
        return Response.json({ error: ERRORS[status] }, { status })
      }

      console.error('Error generating signed URL:', error)
      return Response.json(
        {
          error: 'Failed to generate signed URL',
        },
        { status: 500 },
      )
    }
  },
})

export const createBatchSignedURLEndpoint = (
  collectionSlug: string,
  options: CloudinaryStorageOptions,
): Endpoint => ({
  path: '/signed-urls',
  method: 'post',
  handler: async (req) => {
    const body = await req.json?.().catch(() => undefined)

    if (!body || typeof body !== 'object') {
      return Response.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const ids = (body as Record<string, unknown>).ids

    if (!ids || !Array.isArray(ids) || !ids.every((id: unknown) => typeof id === 'string')) {
      return Response.json({ error: 'Array of document IDs required' }, { status: 400 })
    }

    if (ids.length > MAX_BATCH_IDS) {
      return Response.json(
        { error: `At most ${MAX_BATCH_IDS} document IDs per request` },
        { status: 400 },
      )
    }

    const checked = checkTransformations((body as Record<string, unknown>).transformations)
    if (!checked.ok) {
      return Response.json({ error: checked.error }, { status: 400 })
    }
    const { transformations } = checked

    try {
      // Get collection config
      const collectionConfig = options.collections[collectionSlug]
      const rawConfig = typeof collectionConfig === 'boolean' ? {} : collectionConfig
      const config = normalizeCollectionConfig(rawConfig)
      const signedURLConfig = getSignedURLConfig(config)

      if (!signedURLConfig) {
        return Response.json(
          { error: 'Signed URLs not configured for this collection' },
          { status: 500 },
        )
      }

      const refused = (id: string, status: AccessStatus) => ({ id, status, error: ERRORS[status] })

      // find returns only the documents the caller may read, or throws Forbidden
      let docs
      try {
        const found = await req.payload.find({
          collection: collectionSlug,
          where: {
            id: {
              in: ids,
            },
          },
          limit: ids.length,
          req,
          overrideAccess: false,
        })
        docs = found.docs
      } catch (error) {
        const status = accessErrorStatus(error)
        if (!status) throw error
        return Response.json({ results: ids.map((id) => refused(id, status)) })
      }

      // The access rule decides, and each URL is built, on the documents as stored, in every
      // locale. A stored read that fails refuses every ID, so the endpoint fails closed.
      const stored = await readStoredOrRefuse(
        req,
        collectionSlug,
        docs.map((readable) => readable.id),
      )
      if (stored === 'refused') {
        return Response.json({ results: ids.map((id) => refused(id, 403)) })
      }

      // One result per requested ID, in the order requested
      const results = await Promise.all(
        ids.map(async (id) => {
          const readable = docs.find((found) => String(found.id) === id)
          const read = readable && stored.get(String(readable.id))

          // Missing, or outside a query-based read
          if (!readable || !read) {
            return refused(id, 404)
          }
          const doc = read.doc

          // Check if this file requires signed URLs
          if (!doc.requiresSignedURL) {
            return {
              id,
              url: readable.url,
              requiresSignedURL: false,
            }
          }

          // Only a reader with the original gets a URL, so transformations apply to originals only
          if ((await resolveViewsAccess(req, read.views, config)) !== 'original') {
            return refused(id, 403)
          }

          // Generate signed URL with transformations
          const signedUrl = generateSignedURL(
            { ...deliveryAssetOf(doc), transformations },
            signedURLConfig,
          )

          return {
            id,
            url: signedUrl,
            transformations,
          }
        }),
      )

      return Response.json({ results })
    } catch (error) {
      console.error('Error generating batch signed URLs:', error)
      return Response.json(
        {
          error: 'Failed to generate signed URLs',
        },
        { status: 500 },
      )
    }
  },
})

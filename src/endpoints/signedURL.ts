import type { Endpoint } from 'payload'
import { generateSignedURL, generateDownloadURL, isAccessAllowed } from '../helpers/signedURLs.js'
import type { CloudinaryStorageOptions } from '../types.js'
import { normalizeCollectionConfig, getSignedURLConfig } from '../helpers/normalizeConfig.js'

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

    try {
      // Get the document - IMPORTANT: We pass the req object to ensure
      // Payload's collection-level access control is properly enforced.
      // If the user doesn't have read access, this will throw an error.
      const doc = await req.payload.findByID({
        collection: collectionSlug,
        id,
        req,
      })

      if (!doc) {
        return Response.json({ error: 'Document not found' }, { status: 404 })
      }

      // Check if this file requires signed URLs
      if (!doc.requiresSignedURL) {
        return Response.json(
          {
            error: 'This file does not require signed URLs',
            url: doc.url,
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

      // Check access permissions
      const hasAccess = await isAccessAllowed(req, doc, signedURLConfig)

      if (!hasAccess) {
        return Response.json({ error: 'Access denied' }, { status: 403 })
      }

      // Parse transformations from query params
      let transformations: Record<string, any> | undefined
      const transformParam = req.query?.transformations
      if (transformParam) {
        try {
          transformations =
            typeof transformParam === 'string' ? JSON.parse(transformParam) : transformParam
        } catch (e) {
          // If JSON parse fails, try to parse as comma-separated key-value pairs
          // e.g., "width:300,height:400,crop:fill"
          if (typeof transformParam === 'string') {
            transformations = {}
            transformParam.split(',').forEach((pair) => {
              const [key, value] = pair.split(':')
              if (key && value) {
                transformations![key.trim()] = isNaN(Number(value)) ? value.trim() : Number(value)
              }
            })
          }
        }
      }

      // For authenticated uploads, we need to generate a new signed URL with transformations
      const signedUrl = generateSignedURL(
        {
          publicId: doc.cloudinaryPublicId,
          version: doc.cloudinaryVersion,
          resourceType: doc.cloudinaryResourceType,
          format: doc.cloudinaryFormat,
          expiresIn: signedURLConfig.expiresIn,
          transformations,
        },
        signedURLConfig,
      )

      // Also generate download URL if requested
      let downloadUrl
      if (req.query?.download === 'true') {
        downloadUrl = generateDownloadURL(doc.cloudinaryPublicId, doc.filename, {
          version: doc.cloudinaryVersion,
          resourceType: doc.cloudinaryResourceType,
          expiresIn: signedURLConfig.expiresIn,
        })
      }

      return Response.json({
        url: signedUrl,
        downloadUrl,
        expiresIn: signedURLConfig.expiresIn || 3600,
        expiresAt: new Date(Date.now() + (signedURLConfig.expiresIn || 3600) * 1000).toISOString(),
        transformations,
      })
    } catch (error) {
      console.error('Error generating signed URL:', error)

      // Check if it's an authentication error
      if (
        error instanceof Error &&
        (error.message.includes('Authentication required') ||
          error.message.includes('Unauthorized'))
      ) {
        return Response.json(
          {
            error: 'Authentication required for private files',
          },
          { status: 403 },
        )
      }

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
    const transformations = (body as Record<string, unknown>).transformations as
      | Record<string, any>
      | undefined

    if (!ids || !Array.isArray(ids) || !ids.every((id: unknown) => typeof id === 'string')) {
      return Response.json({ error: 'Array of document IDs required' }, { status: 400 })
    }

    try {
      // Get all documents - IMPORTANT: We pass the req object to ensure
      // Payload's collection-level access control is properly enforced.
      // Only documents the user has read access to will be returned.
      const docs = await req.payload.find({
        collection: collectionSlug,
        where: {
          id: {
            in: ids,
          },
        },
        limit: ids.length,
        req,
      })

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

      // Generate signed URLs for each document
      const results = await Promise.all(
        docs.docs.map(async (doc) => {
          // Check if this file requires signed URLs
          if (!doc.requiresSignedURL) {
            return {
              id: doc.id,
              url: doc.url,
              requiresSignedURL: false,
            }
          }

          // Check access permissions
          const hasAccess = await isAccessAllowed(req, doc, signedURLConfig)

          if (!hasAccess) {
            return {
              id: doc.id,
              error: 'Access denied',
            }
          }

          // Generate signed URL with transformations
          const signedUrl = generateSignedURL(
            {
              publicId: doc.cloudinaryPublicId,
              version: doc.cloudinaryVersion,
              resourceType: doc.cloudinaryResourceType,
              format: doc.cloudinaryFormat,
              expiresIn: signedURLConfig.expiresIn,
              transformations,
            },
            signedURLConfig,
          )

          return {
            id: doc.id,
            url: signedUrl,
            expiresIn: signedURLConfig.expiresIn || 3600,
            expiresAt: new Date(
              Date.now() + (signedURLConfig.expiresIn || 3600) * 1000,
            ).toISOString(),
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

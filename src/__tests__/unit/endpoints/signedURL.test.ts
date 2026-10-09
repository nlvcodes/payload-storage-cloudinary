import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Forbidden, NotFound } from 'payload'
import { createSignedURLEndpoint, createBatchSignedURLEndpoint } from '../../../endpoints/signedURL'
import { mockPayloadRequest } from '../../setup'
import type { CloudinaryStorageOptions } from '../../../types'

describe('signedURL endpoints', () => {
  const mockOptions: CloudinaryStorageOptions = {
    cloudConfig: {
      cloud_name: 'test-cloud',
      api_key: 'test-key',
      api_secret: 'test-secret',
    },
    collections: {
      media: {
        privateFiles: true,
      },
    },
  }

  describe('createSignedURLEndpoint', () => {
    let endpoint: any

    beforeEach(() => {
      endpoint = createSignedURLEndpoint('media', mockOptions)
      vi.clearAllMocks()
    })

    it('should return error when no ID provided', async () => {
      const req = mockPayloadRequest({
        routeParams: {},
      })

      const response = await endpoint.handler(req)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Document ID required')
    })

    it('should return error when document not found', async () => {
      const req = mockPayloadRequest({
        routeParams: { id: '123' },
      })

      vi.mocked(req.payload.findByID).mockResolvedValue(null)

      const response = await endpoint.handler(req)
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('Document not found')
    })

    it('should answer 404 when Payload throws NotFound', async () => {
      const req = mockPayloadRequest({
        routeParams: { id: '123' },
      })

      // A document outside a query-based read access is NotFound to that caller
      vi.mocked(req.payload.findByID).mockRejectedValue(new NotFound())

      const response = await endpoint.handler(req)
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('Document not found')
      expect(data.url).toBeUndefined()
    })

    it('should answer 500 for an error that is not an access decision', async () => {
      const req = mockPayloadRequest({
        routeParams: { id: '123' },
      })

      // A message that mentions authorization is not a status: only Payload's error status maps
      vi.mocked(req.payload.findByID).mockRejectedValue(new Error('Unauthorized'))
      vi.spyOn(console, 'error').mockImplementation(() => {})

      const response = await endpoint.handler(req)

      expect(response.status).toBe(500)
    })

    it('should return error when file does not require signed URL', async () => {
      const req = mockPayloadRequest({
        routeParams: { id: '123' },
      })

      const mockDoc = {
        id: '123',
        url: 'https://test.com/image.jpg',
        requiresSignedURL: false,
      }

      vi.mocked(req.payload.findByID).mockResolvedValue(mockDoc)

      const response = await endpoint.handler(req)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('This file does not require signed URLs')
      expect(data.url).toBe(mockDoc.url)
    })

    it('should generate signed URL for authorized user', async () => {
      const req = mockPayloadRequest({
        routeParams: { id: '123' },
        user: { id: 'user-123', role: 'user' },
      })

      const mockDoc = {
        id: '123',
        requiresSignedURL: true,
        cloudinaryPublicId: 'test-public-id',
        cloudinaryVersion: 1234567890,
        cloudinaryResourceType: 'image',
        cloudinaryFormat: 'jpg',
        filename: 'test.jpg',
      }

      vi.mocked(req.payload.findByID).mockResolvedValue(mockDoc)

      const response = await endpoint.handler(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toHaveProperty('url')
      expect(data).not.toHaveProperty('expiresIn')
      expect(data).not.toHaveProperty('expiresAt')
    })

    it('should deny access for unauthorized user (Payload rejects findByID)', async () => {
      const req = mockPayloadRequest({
        routeParams: { id: '123' },
        user: null, // No user
      })

      // Payload's read access rejects the findByID call with Forbidden
      vi.mocked(req.payload.findByID).mockRejectedValue(new Forbidden())

      const response = await endpoint.handler(req)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('Access denied')
      expect(data.url).toBeUndefined()
    })

    it('should generate download URL when requested', async () => {
      const req = mockPayloadRequest({
        routeParams: { id: '123' },
        query: { download: 'true' },
        user: { id: 'user-123', role: 'admin' },
      })

      const mockDoc = {
        id: '123',
        requiresSignedURL: true,
        cloudinaryPublicId: 'test-document',
        cloudinaryVersion: 1234567890,
        cloudinaryResourceType: 'raw',
        filename: 'document.pdf',
      }

      vi.mocked(req.payload.findByID).mockResolvedValue(mockDoc)

      const response = await endpoint.handler(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toHaveProperty('url')
      expect(data).toHaveProperty('downloadUrl')
    })

    it('should use custom auth check when provided', async () => {
      const customAuthCheck = vi.fn().mockReturnValue(false)
      const optionsWithCustomAuth: CloudinaryStorageOptions = {
        ...mockOptions,
        collections: {
          media: {
            privateFiles: {
              enabled: true,
              customAuthCheck,
            },
          },
        },
      }

      const customEndpoint = createSignedURLEndpoint('media', optionsWithCustomAuth)
      const req = mockPayloadRequest({
        routeParams: { id: '123' },
        user: { id: 'user-123', role: 'user' },
      })

      const mockDoc = {
        id: '123',
        requiresSignedURL: true,
        cloudinaryPublicId: 'test-public-id',
      }

      vi.mocked(req.payload.findByID).mockResolvedValue(mockDoc)

      const response = await customEndpoint.handler(req)
      const data = await response.json()

      expect(customAuthCheck).toHaveBeenCalledWith(req, mockDoc)
      expect(response.status).toBe(403)
      expect(data.error).toBe('Access denied')
    })
  })

  describe('createBatchSignedURLEndpoint', () => {
    let endpoint: any

    beforeEach(() => {
      endpoint = createBatchSignedURLEndpoint('media', mockOptions)
      vi.clearAllMocks()
    })

    it('should return error when no IDs provided', async () => {
      const req = mockPayloadRequest({
        json: vi.fn().mockResolvedValue({}),
      })

      const response = await endpoint.handler(req)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Array of document IDs required')
    })

    it('should return error for invalid body shape (non-string IDs)', async () => {
      const req = mockPayloadRequest({
        json: vi.fn().mockResolvedValue({ ids: [123, 456] }),
      })

      const response = await endpoint.handler(req)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Array of document IDs required')
    })

    it('should return error for malformed JSON body', async () => {
      const req = mockPayloadRequest({
        json: vi.fn().mockRejectedValue(new Error('Invalid JSON')),
      })

      const response = await endpoint.handler(req)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid request body')
    })

    it('should generate signed URLs for multiple documents', async () => {
      const req = mockPayloadRequest({
        json: vi.fn().mockResolvedValue({ ids: ['123', '456'] }),
        user: { id: 'user-123', role: 'admin' },
      })

      const mockDocs = [
        {
          id: '123',
          requiresSignedURL: true,
          cloudinaryPublicId: 'image-1',
          cloudinaryVersion: 1234567890,
          cloudinaryResourceType: 'image',
        },
        {
          id: '456',
          requiresSignedURL: true,
          cloudinaryPublicId: 'image-2',
          cloudinaryVersion: 1234567891,
          cloudinaryResourceType: 'image',
        },
      ]

      vi.mocked(req.payload.find).mockResolvedValue({
        docs: mockDocs,
        totalDocs: 2,
        totalPages: 1,
        page: 1,
        pagingCounter: 1,
        hasPrevPage: false,
        hasNextPage: false,
        prevPage: null,
        nextPage: null,
        limit: 10,
      })

      const response = await endpoint.handler(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.results).toHaveLength(2)
      expect(data.results[0]).toHaveProperty('id', '123')
      expect(data.results[0]).toHaveProperty('url')
      expect(data.results[1]).toHaveProperty('id', '456')
      expect(data.results[1]).toHaveProperty('url')
    })

    it('should handle mix of private and public files', async () => {
      const req = mockPayloadRequest({
        json: vi.fn().mockResolvedValue({ ids: ['123', '456'] }),
        user: { id: 'user-123', role: 'user' },
      })

      const mockDocs = [
        {
          id: '123',
          requiresSignedURL: true,
          cloudinaryPublicId: 'private-image',
          cloudinaryResourceType: 'image',
        },
        {
          id: '456',
          requiresSignedURL: false,
          url: 'https://public-url.com/image.jpg',
        },
      ]

      vi.mocked(req.payload.find).mockResolvedValue({
        docs: mockDocs,
        totalDocs: 2,
        totalPages: 1,
        page: 1,
        pagingCounter: 1,
        hasPrevPage: false,
        hasNextPage: false,
        prevPage: null,
        nextPage: null,
        limit: 10,
      })

      const response = await endpoint.handler(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.results).toHaveLength(2)
      expect(data.results[0]).toHaveProperty('url')
      expect(data.results[0]).not.toHaveProperty('expiresIn')
      expect(data.results[1]).toEqual({
        id: '456',
        url: 'https://public-url.com/image.jpg',
        requiresSignedURL: false,
      })
    })

    it('should handle access denied for some documents', async () => {
      const customAuthCheck = vi.fn()
        .mockReturnValueOnce(true)  // Allow first doc
        .mockReturnValueOnce(false) // Deny second doc

      const optionsWithCustomAuth: CloudinaryStorageOptions = {
        ...mockOptions,
        collections: {
          media: {
            privateFiles: {
              enabled: true,
              customAuthCheck,
            },
          },
        },
      }

      const customEndpoint = createBatchSignedURLEndpoint('media', optionsWithCustomAuth)
      const req = mockPayloadRequest({
        json: vi.fn().mockResolvedValue({ ids: ['123', '456'] }),
        user: { id: 'user-123', role: 'user' },
      })

      const mockDocs = [
        {
          id: '123',
          requiresSignedURL: true,
          cloudinaryPublicId: 'allowed-image',
        },
        {
          id: '456',
          requiresSignedURL: true,
          cloudinaryPublicId: 'denied-image',
        },
      ]

      vi.mocked(req.payload.find).mockResolvedValue({
        docs: mockDocs,
        totalDocs: 2,
        totalPages: 1,
        page: 1,
        pagingCounter: 1,
        hasPrevPage: false,
        hasNextPage: false,
        prevPage: null,
        nextPage: null,
        limit: 10,
      })

      const response = await customEndpoint.handler(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.results).toHaveLength(2)
      expect(data.results[0]).toHaveProperty('url')
      expect(data.results[1]).toEqual({
        id: '456',
        status: 403,
        error: 'Access denied',
      })
    })

    it('should give each requested ID the status Payload chose when find is refused', async () => {
      const req = mockPayloadRequest({
        json: vi.fn().mockResolvedValue({ ids: ['123', '456'] }),
        user: null,
      })

      vi.mocked(req.payload.find).mockRejectedValue(new Forbidden())

      const response = await endpoint.handler(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.results).toEqual([
        { id: '123', status: 403, error: 'Access denied' },
        { id: '456', status: 403, error: 'Access denied' },
      ])
    })
  })
})
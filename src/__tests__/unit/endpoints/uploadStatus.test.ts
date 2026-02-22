import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createUploadStatusEndpoint, createCancelUploadEndpoint } from '../../../endpoints/uploadStatus'

describe('uploadStatus endpoints', () => {
  describe('createUploadStatusEndpoint', () => {
    let endpoint: any

    beforeEach(() => {
      endpoint = createUploadStatusEndpoint('media')
      vi.clearAllMocks()
    })

    it('should return 401 when req.user is undefined', async () => {
      const req = { user: undefined, routeParams: {} }

      const response = await endpoint.handler(req)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Authentication required')
    })

    it('should return 401 when req.user is null', async () => {
      const req = { user: null, routeParams: {} }

      const response = await endpoint.handler(req)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Authentication required')
    })

    it('should proceed when user is authenticated', async () => {
      const req = {
        user: { id: 'user-123' },
        routeParams: {},
      }

      const response = await endpoint.handler(req)
      const data = await response.json()

      // Should return 200 with uploads array (empty since no queue exists yet)
      expect(response.status).toBe(200)
      expect(data).toHaveProperty('uploads')
    })
  })

  describe('createCancelUploadEndpoint', () => {
    let endpoint: any

    beforeEach(() => {
      endpoint = createCancelUploadEndpoint('media')
      vi.clearAllMocks()
    })

    it('should return 401 when req.user is undefined', async () => {
      const req = { user: undefined, routeParams: { id: '123' } }

      const response = await endpoint.handler(req)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Authentication required')
    })

    it('should return 400 when no ID provided', async () => {
      const req = {
        user: { id: 'user-123' },
        routeParams: {},
      }

      const response = await endpoint.handler(req)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Upload ID required')
    })
  })
})

import { describe, it, expect, vi } from 'vitest'
// generateSignedURL and generateDownloadURL run against the real SDK in
// src/__tests__/payload/signedURLs.test.ts, so their signatures are checked for real.
import { isAccessAllowed, generatePrivateUploadOptions } from '../../../helpers/signedURLs'
import type { SignedURLConfig } from '../../../types'

describe('signedURLs helpers', () => {
  describe('isAccessAllowed', () => {
    it('should use custom auth check when provided', async () => {
      const customAuthCheck = vi.fn().mockReturnValue(true)
      const config: SignedURLConfig = {
        enabled: true,
        customAuthCheck,
      }

      const req = { user: { id: '123' } }
      const doc = { id: 'doc-123' }

      const result = await isAccessAllowed(req, doc, config)

      expect(customAuthCheck).toHaveBeenCalledWith(req, doc)
      expect(result).toBe(true)
    })

    // The 1.2.x call with no config fails closed: see payload/isAccessAllowedBareConfig.test.ts
    it('should return true for a collection with no custom auth check (access already checked by Payload)', async () => {
      const req = { user: { id: '123' } }
      const doc = { id: 'doc-123' }

      const result = await isAccessAllowed(req, doc, { privateFiles: true })

      expect(result).toBe(true)
    })

    it('should return true even without user (Payload already enforced access)', async () => {
      const req = { user: null }
      const doc = { id: 'doc-123' }

      const result = await isAccessAllowed(req, doc, { privateFiles: true })

      expect(result).toBe(true)
    })

    it('should handle async custom auth checks', async () => {
      const customAuthCheck = vi.fn().mockResolvedValue(false)
      const config: SignedURLConfig = {
        enabled: true,
        customAuthCheck,
      }

      const req = { user: { id: '123' } }
      const doc = { id: 'doc-123' }

      const result = await isAccessAllowed(req, doc, config)

      expect(result).toBe(false)
    })

    it('should deny the original on a publicTransformation collection with no custom auth check', async () => {
      const req = { user: { id: '123' } }
      const doc = { id: 'doc-123', hasPublicTransformation: true }

      const result = await isAccessAllowed(req, doc, {
        privateFiles: true,
        transformations: {
          default: { quality: 'auto' },
          publicTransformation: { enabled: true },
        },
      })

      expect(result).toBe(false)
    })

    it('should allow the original when the collection config has a passing custom auth check', async () => {
      const req = { user: { id: '123' } }
      const doc = { id: 'doc-123', hasPublicTransformation: true }

      const result = await isAccessAllowed(req, doc, {
        privateFiles: { enabled: true, customAuthCheck: () => true },
        transformations: {
          default: { quality: 'auto' },
          publicTransformation: { enabled: true },
        },
      })

      expect(result).toBe(true)
    })
  })

  describe('generatePrivateUploadOptions', () => {
    it('should return default authenticated options', () => {
      const config: SignedURLConfig = {
        enabled: true,
      }

      const options = generatePrivateUploadOptions(config)

      expect(options).toEqual({
        type: 'authenticated',
        access_mode: 'authenticated',
      })
    })

    it('should include auth types when specified', () => {
      const config: SignedURLConfig = {
        enabled: true,
        authTypes: ['upload', 'token'],
      }

      const options = generatePrivateUploadOptions(config)

      expect(options).toEqual({
        type: 'authenticated',
        access_mode: 'authenticated',
        access_type: 'upload,token',
      })
    })
  })
})

import { describe, it, expect, vi } from 'vitest'
import { v2 as cloudinary } from 'cloudinary'
import {
  generateSignedURL,
  isAccessAllowed,
  generatePrivateUploadOptions,
  generateDownloadURL,
} from '../../../helpers/signedURLs'
import type { SignedURLConfig } from '../../../types'

describe('signedURLs helpers', () => {
  describe('generateSignedURL', () => {
    it('should generate signed URL with default options', () => {
      const url = generateSignedURL({
        publicId: 'my-image',
        resourceType: 'image',
      })

      expect(cloudinary.url).toHaveBeenCalledWith(
        'my-image',
        expect.objectContaining({
          secure: true,
          sign_url: true,
          type: 'upload',
        }),
      )
      expect(typeof url).toBe('string')
    })

    it('should include version when provided', () => {
      generateSignedURL({
        publicId: 'my-image',
        version: 1234567890,
      })

      expect(cloudinary.url).toHaveBeenCalledWith(
        'my-image',
        expect.objectContaining({
          version: 1234567890,
        }),
      )
    })

    it('should apply custom transformations', () => {
      generateSignedURL({
        publicId: 'my-image',
        transformations: {
          width: 400,
          height: 300,
          crop: 'fill',
        },
      })

      expect(cloudinary.url).toHaveBeenCalledWith(
        'my-image',
        expect.objectContaining({
          transformation: {
            width: 400,
            height: 300,
            crop: 'fill',
          },
        }),
      )
    })

    it('should set attachment for downloads', () => {
      generateSignedURL({
        publicId: 'my-document',
        attachmentFilename: 'download.pdf',
      })

      expect(cloudinary.url).toHaveBeenCalledWith(
        'my-document',
        expect.objectContaining({
          attachment: 'download.pdf',
        }),
      )
    })

    it('should include format in resource identifier when provided', () => {
      generateSignedURL({
        publicId: 'my-image',
        format: 'webp',
      })

      expect(cloudinary.url).toHaveBeenCalledWith(
        'my-image.webp',
        expect.any(Object),
      )
    })

    it('should set expires_at based on expiresIn', () => {
      const now = Date.now()
      vi.spyOn(Date, 'now').mockReturnValue(now)

      generateSignedURL({
        publicId: 'my-image',
        expiresIn: 7200,
      })

      const expectedTimestamp = Math.round(now / 1000)
      const expectedExpiry = expectedTimestamp + 7200

      expect(cloudinary.url).toHaveBeenCalledWith(
        'my-image',
        expect.objectContaining({
          expires_at: expectedExpiry,
        }),
      )
    })
  })

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

    it('should return true by default (access already checked by Payload)', async () => {
      const req = { user: { id: '123' } }
      const doc = { id: 'doc-123' }

      const result = await isAccessAllowed(req, doc)

      expect(result).toBe(true)
    })

    it('should return true even without user (Payload already enforced access)', async () => {
      const req = { user: null }
      const doc = { id: 'doc-123' }

      const result = await isAccessAllowed(req, doc)

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

  describe('generateDownloadURL', () => {
    it('should generate download URL with attachment', () => {
      const url = generateDownloadURL('my-document', 'report.pdf')

      expect(cloudinary.url).toHaveBeenCalledWith(
        'my-document',
        expect.objectContaining({
          secure: true,
          sign_url: true,
          type: 'upload',
          attachment: 'report.pdf',
        }),
      )
      expect(typeof url).toBe('string')
    })

    it('should include optional parameters', () => {
      generateDownloadURL('my-video', 'video.mp4', {
        resourceType: 'video',
        version: 1234567890,
        expiresIn: 3600,
      })

      expect(cloudinary.url).toHaveBeenCalledWith(
        'my-video',
        expect.objectContaining({
          version: 1234567890,
          attachment: 'video.mp4',
        }),
      )
    })
  })
})

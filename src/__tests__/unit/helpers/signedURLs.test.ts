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
    beforeEach(() => {
      vi.mocked(cloudinary.url).mockReturnValue('https://cloudinary.com/signed-url')
      vi.mocked(cloudinary.utils.sign_url).mockReturnValue('https://cloudinary.com/signed-url-with-auth')
    })

    it('should generate signed URL with default options', () => {
      const url = generateSignedURL({
        publicId: 'my-image',
        resourceType: 'image',
      })

      expect(cloudinary.url).toHaveBeenCalledWith('my-image', {
        resource_type: 'image',
        secure: true,
        sign_url: true,
        type: 'authenticated',
      })
      expect(url).toBe('https://cloudinary.com/signed-url')
    })

    it('should include version when provided', () => {
      generateSignedURL({
        publicId: 'my-image',
        version: 1234567890,
      })

      expect(cloudinary.url).toHaveBeenCalledWith('my-image', 
        expect.objectContaining({
          version: 1234567890,
        })
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

      expect(cloudinary.url).toHaveBeenCalledWith('my-image', 
        expect.objectContaining({
          transformation: {
            width: 400,
            height: 300,
            crop: 'fill',
          },
        })
      )
    })

    it('should set attachment for downloads', () => {
      generateSignedURL({
        publicId: 'my-document',
        attachmentFilename: 'download.pdf',
      })

      expect(cloudinary.url).toHaveBeenCalledWith('my-document', 
        expect.objectContaining({
          attachment: 'download.pdf',
        })
      )
    })

    it('should use config auth types when provided', () => {
      const config: SignedURLConfig = {
        enabled: true,
        authTypes: ['upload', 'authenticated'],
      }

      generateSignedURL({
        publicId: 'my-image',
      }, config)

      expect(cloudinary.url).toHaveBeenCalledWith('my-image', 
        expect.objectContaining({
          auth_types: 'upload,authenticated',
        })
      )
    })

    it('should calculate expiration time', () => {
      const now = Date.now()
      vi.spyOn(Date, 'now').mockReturnValue(now)

      generateSignedURL({
        publicId: 'my-image',
        expiresIn: 7200, // 2 hours
      })

      const expectedExpiry = Math.floor((now + 7200 * 1000) / 1000)
      
      expect(cloudinary.utils.sign_url).toHaveBeenCalledWith(
        'https://cloudinary.com/signed-url',
        expect.objectContaining({
          auth_token: expect.objectContaining({
            duration: 7200,
            start_time: Math.floor(now / 1000),
            expiration: expectedExpiry,
          }),
        })
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

      // This function assumes Payload already checked access
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
    beforeEach(() => {
      vi.mocked(cloudinary.url).mockReturnValue('https://cloudinary.com/download-url')
    })

    it('should generate download URL with attachment', () => {
      const url = generateDownloadURL('my-document', 'report.pdf')

      expect(cloudinary.url).toHaveBeenCalledWith('my-document', 
        expect.objectContaining({
          attachment: 'report.pdf',
          resource_type: 'image',
          secure: true,
          sign_url: true,
          type: 'authenticated',
        })
      )
      expect(url).toBe('https://cloudinary.com/download-url')
    })

    it('should include optional parameters', () => {
      generateDownloadURL('my-video', 'video.mp4', {
        resourceType: 'video',
        version: 1234567890,
        expiresIn: 3600,
      })

      expect(cloudinary.url).toHaveBeenCalledWith('my-video', 
        expect.objectContaining({
          attachment: 'video.mp4',
          resource_type: 'video',
          version: 1234567890,
        })
      )
    })
  })
})
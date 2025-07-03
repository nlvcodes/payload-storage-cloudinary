import { describe, it, expect, vi, beforeEach } from 'vitest'
import { v2 as cloudinary } from 'cloudinary'
import { createUploadHandler } from '../../../handlers/handleUpload'
import { mockFile, mockCloudinaryResponse } from '../../setup'
import type { CloudinaryStorageOptions } from '../../../types'

describe('handleUpload', () => {
  const mockOptions: CloudinaryStorageOptions = {
    cloudConfig: {
      cloud_name: 'test-cloud',
      api_key: 'test-key',
      api_secret: 'test-secret',
    },
    collections: {
      media: {
        folder: 'test-folder',
        transformations: {
          quality: 'auto',
          fetch_format: 'auto',
        },
      },
    },
  }

  const mockCollection = {
    slug: 'media',
    config: {},
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Regular upload (files < 100MB)', () => {
    it('should upload file successfully', async () => {
      const mockResponse = mockCloudinaryResponse()
      const uploadStream = {
        end: vi.fn(),
        on: vi.fn(),
        pipe: vi.fn(),
      }
      
      vi.mocked(cloudinary.uploader.upload_stream).mockImplementation(
        (options, callback) => {
          // Simulate successful upload
          setTimeout(() => callback(null, mockResponse), 0)
          return uploadStream as any
        }
      )

      const handler = createUploadHandler(mockOptions)
      const file = mockFile({ filesize: 50 * 1024 * 1024 }) // 50MB
      const data = {}

      const result = await handler({ 
        collection: mockCollection as any, 
        file, 
        data 
      })

      expect(cloudinary.uploader.upload_stream).toHaveBeenCalledWith(
        expect.objectContaining({
          folder: 'test-folder',
          quality: 'auto',
          fetch_format: 'auto',
          resource_type: 'auto',
          use_filename: true,
          unique_filename: true,
        }),
        expect.any(Function)
      )

      expect(result).toEqual({
        url: mockResponse.secure_url,
        thumbnailURL: expect.stringContaining('c_limit,h_150,w_150'),
        filename: file.filename,
        mimeType: file.mimeType,
        filesize: mockResponse.bytes,
        width: mockResponse.width,
        height: mockResponse.height,
        cloudinaryPublicId: mockResponse.public_id,
        cloudinaryVersion: mockResponse.version,
        cloudinaryFolder: mockResponse.folder,
        cloudinaryFormat: mockResponse.format,
        cloudinaryResourceType: mockResponse.resource_type,
        cloudinaryUrl: mockResponse.secure_url,
        cloudinarySecureUrl: mockResponse.secure_url,
      })
    })

    it('should handle upload errors', async () => {
      const uploadStream = {
        end: vi.fn(),
        on: vi.fn(),
        pipe: vi.fn(),
      }
      
      vi.mocked(cloudinary.uploader.upload_stream).mockImplementation(
        (options, callback) => {
          setTimeout(() => callback(new Error('Upload failed'), null), 0)
          return uploadStream as any
        }
      )

      const handler = createUploadHandler(mockOptions)
      const file = mockFile()
      const data = {}

      await expect(
        handler({ collection: mockCollection as any, file, data })
      ).rejects.toThrow('Failed to upload to Cloudinary: Upload failed')
    })
  })

  describe('Large file upload (files > 100MB)', () => {
    it('should use upload_large_stream for large files', async () => {
      const mockResponse = mockCloudinaryResponse()
      const uploadStream = {
        end: vi.fn(),
        on: vi.fn(),
        pipe: vi.fn(),
      }
      
      vi.mocked(cloudinary.uploader.upload_large_stream).mockImplementation(
        (options, callback) => {
          setTimeout(() => callback(null, mockResponse), 0)
          return uploadStream as any
        }
      )

      const handler = createUploadHandler(mockOptions)
      const file = mockFile({ filesize: 150 * 1024 * 1024 }) // 150MB
      const data = {}

      const result = await handler({ 
        collection: mockCollection as any, 
        file, 
        data 
      })

      expect(cloudinary.uploader.upload_large_stream).toHaveBeenCalledWith(
        expect.objectContaining({
          folder: 'test-folder',
          chunk_size: 20 * 1024 * 1024, // 20MB chunks
        }),
        expect.any(Function)
      )

      expect(result.cloudinaryPublicId).toBe(mockResponse.public_id)
    })

    it('should handle large file upload errors with proper message', async () => {
      const uploadStream = {
        end: vi.fn(),
        on: vi.fn(),
        pipe: vi.fn(),
      }
      
      vi.mocked(cloudinary.uploader.upload_large_stream).mockImplementation(
        (options, callback) => {
          const error = new Error('File size too large')
          setTimeout(() => callback(error, null), 0)
          return uploadStream as any
        }
      )

      const handler = createUploadHandler(mockOptions)
      const file = mockFile({ filesize: 500 * 1024 * 1024 }) // 500MB
      const data = {}

      await expect(
        handler({ collection: mockCollection as any, file, data })
      ).rejects.toThrow('File too large for your Cloudinary plan')
    })
  })

  describe('Dynamic folder handling', () => {
    it('should use dynamic folder from data when configured', async () => {
      const mockResponse = mockCloudinaryResponse({ folder: 'custom-folder' })
      const uploadStream = {
        end: vi.fn(),
        on: vi.fn(),
        pipe: vi.fn(),
      }
      
      vi.mocked(cloudinary.uploader.upload_stream).mockImplementation(
        (options, callback) => {
          setTimeout(() => callback(null, mockResponse), 0)
          return uploadStream as any
        }
      )

      const optionsWithDynamicFolder: CloudinaryStorageOptions = {
        ...mockOptions,
        collections: {
          media: {
            folder: {
              path: 'default-folder',
              enableDynamic: true,
              fieldName: 'cloudinaryFolder',
            },
          },
        },
      }

      const handler = createUploadHandler(optionsWithDynamicFolder)
      const file = mockFile()
      const data = { cloudinaryFolder: 'custom-folder' }

      await handler({ collection: mockCollection as any, file, data })

      expect(cloudinary.uploader.upload_stream).toHaveBeenCalledWith(
        expect.objectContaining({
          folder: 'custom-folder',
        }),
        expect.any(Function)
      )
    })
  })

  describe('Private files', () => {
    it('should mark files as requiring signed URL when privateFiles is enabled', async () => {
      const mockResponse = mockCloudinaryResponse()
      const uploadStream = {
        end: vi.fn(),
        on: vi.fn(),
        pipe: vi.fn(),
      }
      
      vi.mocked(cloudinary.uploader.upload_stream).mockImplementation(
        (options, callback) => {
          setTimeout(() => callback(null, mockResponse), 0)
          return uploadStream as any
        }
      )

      const optionsWithPrivateFiles: CloudinaryStorageOptions = {
        ...mockOptions,
        collections: {
          media: {
            privateFiles: true,
          },
        },
      }

      const handler = createUploadHandler(optionsWithPrivateFiles)
      const file = mockFile()
      const data = {}

      const result = await handler({ 
        collection: mockCollection as any, 
        file, 
        data 
      })

      expect(cloudinary.uploader.upload_stream).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'authenticated',
          access_mode: 'authenticated',
        }),
        expect.any(Function)
      )

      expect(result.requiresSignedURL).toBe(true)
    })
  })

  describe('Transformation presets', () => {
    it('should apply selected transformation preset to URL', async () => {
      const mockResponse = mockCloudinaryResponse()
      const uploadStream = {
        end: vi.fn(),
        on: vi.fn(),
        pipe: vi.fn(),
      }
      
      vi.mocked(cloudinary.uploader.upload_stream).mockImplementation(
        (options, callback) => {
          setTimeout(() => callback(null, mockResponse), 0)
          return uploadStream as any
        }
      )

      const optionsWithPresets: CloudinaryStorageOptions = {
        ...mockOptions,
        collections: {
          media: {
            transformations: {
              default: {
                quality: 'auto',
              },
              presets: {
                card: { width: 400, height: 400, crop: 'fill' },
              },
              enablePresetSelection: true,
            },
          },
        },
      }

      const handler = createUploadHandler(optionsWithPresets)
      const file = mockFile()
      const data = { transformationPreset: 'card' }

      const result = await handler({ 
        collection: mockCollection as any, 
        file, 
        data 
      })

      // URL should have the selected preset transformations
      expect(result.url).toContain('w_400,h_400,c_fill')
      expect(result.transformationPreset).toBe('card')
    })
  })
})
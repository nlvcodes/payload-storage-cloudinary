import { describe, it, expect, vi, beforeEach } from 'vitest'
import { v2 as cloudinary } from 'cloudinary'
import { PassThrough } from 'stream'
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
    it('should upload file successfully and return data', async () => {
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
          resource_type: 'auto',
        }),
        expect.any(Function)
      )

      // Handler must return data (not void) for plugin-cloud-storage 3.70.0+
      expect(result).toBeDefined()
      expect(result.cloudinaryPublicId).toBe(mockResponse.public_id)
      expect(result.cloudinaryVersion).toBe(mockResponse.version)
      expect(result.cloudinaryFormat).toBe(mockResponse.format)
      expect(result.cloudinaryResourceType).toBe(mockResponse.resource_type)
      expect(result.cloudinaryUrl).toBe(mockResponse.secure_url)
      expect(result.filename).toBe(file.filename)
      expect(result.mimeType).toBe(file.mimeType)
      expect(result.filesize).toBe(mockResponse.bytes)
      expect(result.width).toBe(mockResponse.width)
      expect(result.height).toBe(mockResponse.height)
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

      vi.mocked(cloudinary.uploader.upload_large_stream).mockImplementation(
        (options: any, callback: any) => {
          const stream = new PassThrough()
          stream.on('finish', () => {
            callback(null, mockResponse)
          })
          return stream as any
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

      expect(result).toBeDefined()
      expect(result.cloudinaryPublicId).toBe(mockResponse.public_id)
    })

    it('should handle large file upload errors with proper message', async () => {
      vi.mocked(cloudinary.uploader.upload_large_stream).mockImplementation(
        (options: any, callback: any) => {
          const stream = new PassThrough()
          stream.on('finish', () => {
            callback(new Error('File size too large'), null)
          })
          return stream as any
        }
      )

      const handler = createUploadHandler(mockOptions)
      const file = mockFile({ filesize: 500 * 1024 * 1024 }) // 500MB
      const data = {}

      await expect(
        handler({ collection: mockCollection as any, file, data })
      ).rejects.toThrow('Failed to upload to Cloudinary')
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

      expect(result).toBeDefined()
      expect(result.requiresSignedURL).toBe(true)
    })
  })

  describe('Return value contract (Issue #3)', () => {
    it('should return data when clientUploadContext is present (skip re-upload)', async () => {
      const handler = createUploadHandler(mockOptions)
      const file = mockFile()
      const data = { existingField: 'value' }

      const result = await handler({
        collection: mockCollection as any,
        file,
        data,
        clientUploadContext: { uploadId: '123' },
      } as any)

      // Should return data without uploading
      expect(cloudinary.uploader.upload_stream).not.toHaveBeenCalled()
      expect(result).toBe(data)
    })

    it('should return data on early return when no buffer and existing publicId', async () => {
      const handler = createUploadHandler(mockOptions)
      const file = { ...mockFile(), buffer: undefined as any }
      const data = {
        cloudinaryPublicId: 'existing-id',
        cloudinaryUrl: 'https://example.com/image.jpg',
        filename: 'test.jpg',
        filesize: 1024,
        mimeType: 'image/jpeg',
      }

      const result = await handler({
        collection: mockCollection as any,
        file,
        data
      })

      // Should return data without uploading
      expect(cloudinary.uploader.upload_stream).not.toHaveBeenCalled()
      expect(result).toBeDefined()
      expect(result.cloudinaryPublicId).toBe('existing-id')
    })

    it('should return data on early return when same file is re-sent', async () => {
      const handler = createUploadHandler(mockOptions)
      const file = mockFile({ filename: 'test.jpg' })
      const data = {
        cloudinaryPublicId: 'existing-id',
        cloudinaryUrl: 'https://example.com/image.jpg',
        filename: 'test.jpg',
        filesize: 1024,
        mimeType: 'image/jpeg',
      }

      const result = await handler({
        collection: mockCollection as any,
        file,
        data
      })

      // Should return data without re-uploading
      expect(cloudinary.uploader.upload_stream).not.toHaveBeenCalled()
      expect(result).toBeDefined()
      expect(result.cloudinaryPublicId).toBe('existing-id')
    })
  })

  describe('Folder path sanitization', () => {
    it('should sanitize path traversal attempts', async () => {
      const mockResponse = mockCloudinaryResponse({ folder: 'etcpasswd' })
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
              path: 'default',
              enableDynamic: true,
            },
          },
        },
      }

      const handler = createUploadHandler(optionsWithDynamicFolder)
      const file = mockFile()
      const data = { cloudinaryFolder: '../../etc/passwd' }

      await handler({ collection: mockCollection as any, file, data })

      // Should sanitize .. segments
      expect(cloudinary.uploader.upload_stream).toHaveBeenCalledWith(
        expect.objectContaining({
          folder: 'etc/passwd',
        }),
        expect.any(Function)
      )
    })

    it('should collapse consecutive slashes', async () => {
      const mockResponse = mockCloudinaryResponse({ folder: 'folder/subfolder' })
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
              path: 'default',
              enableDynamic: true,
            },
          },
        },
      }

      const handler = createUploadHandler(optionsWithDynamicFolder)
      const file = mockFile()
      const data = { cloudinaryFolder: 'folder//subfolder' }

      await handler({ collection: mockCollection as any, file, data })

      expect(cloudinary.uploader.upload_stream).toHaveBeenCalledWith(
        expect.objectContaining({
          folder: 'folder/subfolder',
        }),
        expect.any(Function)
      )
    })

    it('should pass through valid paths unchanged', async () => {
      const mockResponse = mockCloudinaryResponse({ folder: 'products/2024' })
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
              path: 'default',
              enableDynamic: true,
            },
          },
        },
      }

      const handler = createUploadHandler(optionsWithDynamicFolder)
      const file = mockFile()
      const data = { cloudinaryFolder: 'products/2024' }

      await handler({ collection: mockCollection as any, file, data })

      expect(cloudinary.uploader.upload_stream).toHaveBeenCalledWith(
        expect.objectContaining({
          folder: 'products/2024',
        }),
        expect.any(Function)
      )
    })
  })

  describe('SVG file handling (Issue #2)', () => {
    it('should use raw resource_type for SVG files', async () => {
      const mockResponse = mockCloudinaryResponse({ resource_type: 'raw', format: 'svg' })
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

      const handler = createUploadHandler(mockOptions)
      const file = mockFile({ mimeType: 'image/svg+xml', filename: 'icon.svg' })
      const data = {}

      await handler({
        collection: mockCollection as any,
        file,
        data
      })

      expect(cloudinary.uploader.upload_stream).toHaveBeenCalledWith(
        expect.objectContaining({
          resource_type: 'raw',
        }),
        expect.any(Function)
      )
    })

    it('should use auto resource_type for non-SVG images', async () => {
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

      const handler = createUploadHandler(mockOptions)
      const file = mockFile({ mimeType: 'image/png', filename: 'photo.png' })
      const data = {}

      await handler({
        collection: mockCollection as any,
        file,
        data
      })

      expect(cloudinary.uploader.upload_stream).toHaveBeenCalledWith(
        expect.objectContaining({
          resource_type: 'auto',
        }),
        expect.any(Function)
      )
    })

    it('should respect explicit config.resourceType over SVG detection', async () => {
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

      const optionsWithResourceType: CloudinaryStorageOptions = {
        ...mockOptions,
        collections: {
          media: {
            resourceType: 'image',
          },
        },
      }

      const handler = createUploadHandler(optionsWithResourceType)
      const file = mockFile({ mimeType: 'image/svg+xml', filename: 'icon.svg' })
      const data = {}

      await handler({
        collection: mockCollection as any,
        file,
        data
      })

      expect(cloudinary.uploader.upload_stream).toHaveBeenCalledWith(
        expect.objectContaining({
          resource_type: 'image',
        }),
        expect.any(Function)
      )
    })
  })
})

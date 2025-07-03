import { describe, it, expect, vi } from 'vitest'
import { v2 as cloudinary } from 'cloudinary'
import { cloudinaryStorage } from '../../index'
import { mockFile, mockCloudinaryResponse } from '../setup'

/**
 * End-to-end tests that simulate real upload scenarios
 */
describe('E2E: Upload Scenarios', () => {
  const baseOptions = {
    cloudConfig: {
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
      api_key: process.env.CLOUDINARY_API_KEY!,
      api_secret: process.env.CLOUDINARY_API_SECRET!,
    },
  }

  describe('Image Upload Scenarios', () => {
    it('should handle typical image upload workflow', async () => {
      const mockResponse = mockCloudinaryResponse({
        resource_type: 'image',
        format: 'jpg',
        width: 1920,
        height: 1080,
      })

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

      const plugin = cloudinaryStorage({
        ...baseOptions,
        collections: {
          media: {
            transformations: {
              default: {
                quality: 'auto',
                fetch_format: 'auto',
              },
            },
          },
        },
      })

      // Simulate upload through plugin's handler
      const handlers = (plugin as any).collections.media.adapter
      const file = mockFile({
        filename: 'photo.jpg',
        mimeType: 'image/jpeg',
        filesize: 2 * 1024 * 1024, // 2MB
      })
      
      const result = await handlers.handleUpload({
        collection: { slug: 'media' },
        file,
        data: {},
      })

      expect(result).toMatchObject({
        filename: 'photo.jpg',
        mimeType: 'image/jpeg',
        width: 1920,
        height: 1080,
        cloudinaryFormat: 'jpg',
        url: expect.stringContaining('q_auto,f_auto'),
        thumbnailURL: expect.stringContaining('c_limit,h_150,w_150'),
      })
    })

    it('should handle image with transformation preset selection', async () => {
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

      const plugin = cloudinaryStorage({
        ...baseOptions,
        collections: {
          media: {
            transformations: {
              presets: {
                hero: { width: 1920, height: 600, crop: 'fill' },
                thumbnail: { width: 150, height: 150, crop: 'thumb' },
              },
              enablePresetSelection: true,
            },
          },
        },
      })

      const handlers = (plugin as any).collections.media.adapter
      const file = mockFile({ filename: 'hero-image.jpg' })
      
      const result = await handlers.handleUpload({
        collection: { slug: 'media' },
        file,
        data: { transformationPreset: 'hero' },
      })

      expect(result.transformationPreset).toBe('hero')
      expect(result.url).toContain('w_1920,h_600,c_fill')
    })
  })

  describe('Video Upload Scenarios', () => {
    it('should handle small video upload', async () => {
      const mockResponse = mockCloudinaryResponse({
        resource_type: 'video',
        format: 'mp4',
        width: 1280,
        height: 720,
        duration: 60.5,
      })

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

      const plugin = cloudinaryStorage({
        ...baseOptions,
        collections: {
          videos: {
            resourceType: 'video',
            folder: 'videos',
          },
        },
      })

      const handlers = (plugin as any).collections.videos.adapter
      const file = mockFile({
        filename: 'demo.mp4',
        mimeType: 'video/mp4',
        filesize: 50 * 1024 * 1024, // 50MB
      })
      
      const result = await handlers.handleUpload({
        collection: { slug: 'videos' },
        file,
        data: {},
      })

      expect(cloudinary.uploader.upload_stream).toHaveBeenCalledWith(
        expect.objectContaining({
          resource_type: 'video',
          folder: 'videos',
        }),
        expect.any(Function)
      )

      expect(result).toMatchObject({
        cloudinaryResourceType: 'video',
        cloudinaryFormat: 'mp4',
        width: 1280,
        height: 720,
      })
    })

    it('should use upload_large for big videos', async () => {
      const mockResponse = mockCloudinaryResponse({
        resource_type: 'video',
        format: 'mp4',
      })

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

      const plugin = cloudinaryStorage({
        ...baseOptions,
        collections: {
          videos: {
            resourceType: 'video',
            uploadQueue: {
              enabled: true,
              largeFileThreshold: 100,
            },
          },
        },
      })

      const handlers = (plugin as any).collections.videos.adapter
      const file = mockFile({
        filename: 'large-video.mp4',
        mimeType: 'video/mp4',
        filesize: 200 * 1024 * 1024, // 200MB - over threshold
      })
      
      await handlers.handleUpload({
        collection: { slug: 'videos' },
        file,
        data: {},
      })

      // Should use upload_large_stream for large files
      expect(cloudinary.uploader.upload_large_stream).toHaveBeenCalled()
    })
  })

  describe('Document Upload Scenarios', () => {
    it('should handle PDF upload with private access', async () => {
      const mockResponse = mockCloudinaryResponse({
        resource_type: 'raw',
        format: 'pdf',
        type: 'authenticated',
      })

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

      const plugin = cloudinaryStorage({
        ...baseOptions,
        collections: {
          documents: {
            resourceType: 'raw',
            privateFiles: true,
            folder: 'documents',
          },
        },
      })

      const handlers = (plugin as any).collections.documents.adapter
      const file = mockFile({
        filename: 'report.pdf',
        mimeType: 'application/pdf',
        filesize: 5 * 1024 * 1024, // 5MB
      })
      
      const result = await handlers.handleUpload({
        collection: { slug: 'documents' },
        file,
        data: {},
      })

      expect(cloudinary.uploader.upload_stream).toHaveBeenCalledWith(
        expect.objectContaining({
          resource_type: 'raw',
          type: 'authenticated',
          access_mode: 'authenticated',
        }),
        expect.any(Function)
      )

      expect(result).toMatchObject({
        cloudinaryResourceType: 'raw',
        requiresSignedURL: true,
      })
    })
  })

  describe('Dynamic Folder Scenarios', () => {
    it('should use dynamic folder path from user input', async () => {
      const mockResponse = mockCloudinaryResponse({
        folder: 'projects/2024/summer',
      })

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

      const plugin = cloudinaryStorage({
        ...baseOptions,
        collections: {
          media: {
            folder: {
              path: 'default-folder',
              enableDynamic: true,
              fieldName: 'cloudinaryFolder',
            },
          },
        },
      })

      const handlers = (plugin as any).collections.media.adapter
      const file = mockFile()
      
      const result = await handlers.handleUpload({
        collection: { slug: 'media' },
        file,
        data: {
          cloudinaryFolder: 'projects/2024/summer',
        },
      })

      expect(cloudinary.uploader.upload_stream).toHaveBeenCalledWith(
        expect.objectContaining({
          folder: 'projects/2024/summer',
        }),
        expect.any(Function)
      )

      expect(result.cloudinaryFolder).toBe('projects/2024/summer')
    })

    it('should sanitize dynamic folder paths', async () => {
      const mockResponse = mockCloudinaryResponse({
        folder: 'sanitized/path',
      })

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

      const plugin = cloudinaryStorage({
        ...baseOptions,
        collections: {
          media: {
            folder: {
              path: 'default',
              enableDynamic: true,
            },
          },
        },
      })

      const handlers = (plugin as any).collections.media.adapter
      const file = mockFile()
      
      await handlers.handleUpload({
        collection: { slug: 'media' },
        file,
        data: {
          cloudinaryFolder: '../../../malicious/path',
        },
      })

      // Should sanitize the path
      expect(cloudinary.uploader.upload_stream).toHaveBeenCalledWith(
        expect.objectContaining({
          folder: expect.not.stringContaining('..'),
        }),
        expect.any(Function)
      )
    })
  })

  describe('Error Scenarios', () => {
    it('should handle network errors gracefully', async () => {
      const uploadStream = {
        end: vi.fn(),
        on: vi.fn(),
        pipe: vi.fn(),
      }
      
      vi.mocked(cloudinary.uploader.upload_stream).mockImplementation(
        (options, callback) => {
          setTimeout(() => callback(new Error('Network error'), null), 0)
          return uploadStream as any
        }
      )

      const plugin = cloudinaryStorage({
        ...baseOptions,
        collections: { media: true },
      })

      const handlers = (plugin as any).collections.media.adapter
      const file = mockFile()
      
      await expect(
        handlers.handleUpload({
          collection: { slug: 'media' },
          file,
          data: {},
        })
      ).rejects.toThrow('Failed to upload to Cloudinary: Network error')
    })

    it('should provide helpful error for quota exceeded', async () => {
      const uploadStream = {
        end: vi.fn(),
        on: vi.fn(),
        pipe: vi.fn(),
      }
      
      vi.mocked(cloudinary.uploader.upload_stream).mockImplementation(
        (options, callback) => {
          const error = new Error('Account has reached its quota')
          setTimeout(() => callback(error, null), 0)
          return uploadStream as any
        }
      )

      const plugin = cloudinaryStorage({
        ...baseOptions,
        collections: { media: true },
      })

      const handlers = (plugin as any).collections.media.adapter
      const file = mockFile()
      
      await expect(
        handlers.handleUpload({
          collection: { slug: 'media' },
          file,
          data: {},
        })
      ).rejects.toThrow('quota')
    })
  })
})
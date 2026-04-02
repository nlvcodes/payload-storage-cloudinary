import { describe, it, expect, vi } from 'vitest'
import { v2 as cloudinary } from 'cloudinary'
import { createUploadHandler } from '../../handlers/handleUpload'
import { mockFile, mockCloudinaryResponse } from '../setup'
import type { CloudinaryStorageOptions } from '../../types'

/**
 * End-to-end tests that simulate real upload scenarios
 * by calling the upload handler directly with various configurations.
 */
describe('E2E: Upload Scenarios', () => {
  const baseOptions: CloudinaryStorageOptions = {
    cloudConfig: {
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
      api_key: process.env.CLOUDINARY_API_KEY!,
      api_secret: process.env.CLOUDINARY_API_SECRET!,
    },
    collections: {},
  }

  describe('Image Upload Scenarios', () => {
    it('should handle typical image upload workflow', async () => {
      const mockResponse = mockCloudinaryResponse({
        resource_type: 'image',
        format: 'jpg',
        width: 1920,
        height: 1080,
      })

      vi.mocked(cloudinary.uploader.upload_stream).mockImplementation(
        (options: any, callback: any) => {
          setTimeout(() => callback(null, mockResponse), 0)
          return { end: vi.fn(), on: vi.fn(), pipe: vi.fn() } as any
        },
      )

      const options: CloudinaryStorageOptions = {
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
      }

      const handler = createUploadHandler(options)
      const file = mockFile({
        filename: 'photo.jpg',
        mimeType: 'image/jpeg',
        filesize: 2 * 1024 * 1024,
      })

      const result = await handler({
        collection: { slug: 'media' } as any,
        file: file as any,
        data: {},
        req: {} as any,
      })

      expect(result).toMatchObject({
        filename: 'photo.jpg',
        mimeType: 'image/jpeg',
        width: 1920,
        height: 1080,
        cloudinaryFormat: 'jpg',
        cloudinaryPublicId: mockResponse.public_id,
      })
      expect(result.url).toBeDefined()
      expect(result.thumbnailURL).toBeDefined()
    })

    it('should handle image with transformation preset selection', async () => {
      const mockResponse = mockCloudinaryResponse()

      vi.mocked(cloudinary.uploader.upload_stream).mockImplementation(
        (options: any, callback: any) => {
          setTimeout(() => callback(null, mockResponse), 0)
          return { end: vi.fn(), on: vi.fn(), pipe: vi.fn() } as any
        },
      )

      const options: CloudinaryStorageOptions = {
        ...baseOptions,
        collections: {
          media: {
            transformations: {
              default: { quality: 'auto' },
              presets: [
                { name: 'hero', label: 'Hero', transformations: { width: 1920, height: 600, crop: 'fill' } },
                { name: 'thumbnail', label: 'Thumbnail', transformations: { width: 150, height: 150, crop: 'thumb' } },
              ],
              enablePresetSelection: true,
            },
          },
        },
      }

      const handler = createUploadHandler(options)
      const file = mockFile({ filename: 'hero-image.jpg' })

      const result = await handler({
        collection: { slug: 'media' } as any,
        file: file as any,
        data: { transformationPreset: 'hero' },
        req: {} as any,
      })

      // The upload should include transformation options from the preset
      expect(cloudinary.uploader.upload_stream).toHaveBeenCalledWith(
        expect.objectContaining({
          transformation: expect.objectContaining({
            width: 1920,
            height: 600,
            crop: 'fill',
          }),
        }),
        expect.any(Function),
      )
      expect(result.cloudinaryPublicId).toBe(mockResponse.public_id)
    })
  })

  describe('Video Upload Scenarios', () => {
    it('should handle small video upload', async () => {
      const mockResponse = mockCloudinaryResponse({
        resource_type: 'video',
        format: 'mp4',
        width: 1280,
        height: 720,
      })

      vi.mocked(cloudinary.uploader.upload_stream).mockImplementation(
        (options: any, callback: any) => {
          setTimeout(() => callback(null, mockResponse), 0)
          return { end: vi.fn(), on: vi.fn(), pipe: vi.fn() } as any
        },
      )

      const options: CloudinaryStorageOptions = {
        ...baseOptions,
        collections: {
          videos: {
            resourceType: 'video',
            folder: 'videos',
          },
        },
      }

      const handler = createUploadHandler(options)
      const file = mockFile({
        filename: 'demo.mp4',
        mimeType: 'video/mp4',
        filesize: 50 * 1024 * 1024, // 50MB
      })

      const result = await handler({
        collection: { slug: 'videos' } as any,
        file: file as any,
        data: {},
        req: {} as any,
      })

      expect(cloudinary.uploader.upload_stream).toHaveBeenCalledWith(
        expect.objectContaining({
          resource_type: 'video',
          folder: 'videos',
        }),
        expect.any(Function),
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

      vi.mocked(cloudinary.uploader.upload_large_stream).mockImplementation(
        (options: any, callback: any) => {
          setTimeout(() => callback(null, mockResponse), 0)
          return {
            write: vi.fn(() => true),
            end: vi.fn(),
            on: vi.fn(),
            once: vi.fn(),
            emit: vi.fn(),
            removeListener: vi.fn(),
          } as any
        },
      )

      const options: CloudinaryStorageOptions = {
        ...baseOptions,
        collections: {
          videos: {
            resourceType: 'video',
          },
        },
      }

      const handler = createUploadHandler(options)
      const file = mockFile({
        filename: 'large-video.mp4',
        mimeType: 'video/mp4',
        filesize: 200 * 1024 * 1024, // 200MB - over 100MB threshold
      })

      await handler({
        collection: { slug: 'videos' } as any,
        file: file as any,
        data: {},
        req: {} as any,
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

      vi.mocked(cloudinary.uploader.upload_stream).mockImplementation(
        (options: any, callback: any) => {
          setTimeout(() => callback(null, mockResponse), 0)
          return { end: vi.fn(), on: vi.fn(), pipe: vi.fn() } as any
        },
      )

      const options: CloudinaryStorageOptions = {
        ...baseOptions,
        collections: {
          documents: {
            resourceType: 'raw',
            privateFiles: true,
            folder: 'documents',
          },
        },
      }

      const handler = createUploadHandler(options)
      const file = mockFile({
        filename: 'report.pdf',
        mimeType: 'application/pdf',
        filesize: 5 * 1024 * 1024,
      })

      const result = await handler({
        collection: { slug: 'documents' } as any,
        file: file as any,
        data: {},
        req: {} as any,
      })

      expect(cloudinary.uploader.upload_stream).toHaveBeenCalledWith(
        expect.objectContaining({
          resource_type: 'raw',
          type: 'authenticated',
          access_mode: 'authenticated',
        }),
        expect.any(Function),
      )

      expect(result).toMatchObject({
        cloudinaryResourceType: 'raw',
        isPrivate: true,
        requiresSignedURL: true,
      })
    })
  })

  describe('Dynamic Folder Scenarios', () => {
    it('should use dynamic folder path from user input', async () => {
      const mockResponse = mockCloudinaryResponse({
        folder: 'projects/2024/summer',
      })

      vi.mocked(cloudinary.uploader.upload_stream).mockImplementation(
        (options: any, callback: any) => {
          setTimeout(() => callback(null, mockResponse), 0)
          return { end: vi.fn(), on: vi.fn(), pipe: vi.fn() } as any
        },
      )

      const options: CloudinaryStorageOptions = {
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
      }

      const handler = createUploadHandler(options)
      const file = mockFile()

      const result = await handler({
        collection: { slug: 'media' } as any,
        file: file as any,
        data: {
          cloudinaryFolder: 'projects/2024/summer',
        },
        req: {} as any,
      })

      expect(cloudinary.uploader.upload_stream).toHaveBeenCalledWith(
        expect.objectContaining({
          folder: 'projects/2024/summer',
        }),
        expect.any(Function),
      )

      expect(result.cloudinaryFolder).toBe('projects/2024/summer')
    })

    it('should sanitize dynamic folder paths', async () => {
      const mockResponse = mockCloudinaryResponse({
        folder: 'malicious/path',
      })

      vi.mocked(cloudinary.uploader.upload_stream).mockImplementation(
        (options: any, callback: any) => {
          setTimeout(() => callback(null, mockResponse), 0)
          return { end: vi.fn(), on: vi.fn(), pipe: vi.fn() } as any
        },
      )

      const options: CloudinaryStorageOptions = {
        ...baseOptions,
        collections: {
          media: {
            folder: {
              path: 'default',
              enableDynamic: true,
            },
          },
        },
      }

      const handler = createUploadHandler(options)
      const file = mockFile()

      await handler({
        collection: { slug: 'media' } as any,
        file: file as any,
        data: {
          cloudinaryFolder: '../../../malicious/path',
        },
        req: {} as any,
      })

      // Should sanitize the path (remove ..)
      expect(cloudinary.uploader.upload_stream).toHaveBeenCalledWith(
        expect.objectContaining({
          folder: expect.not.stringContaining('..'),
        }),
        expect.any(Function),
      )
    })
  })

  describe('Error Scenarios', () => {
    it('should handle network errors gracefully', async () => {
      vi.mocked(cloudinary.uploader.upload_stream).mockImplementation(
        (options: any, callback: any) => {
          setTimeout(() => callback(new Error('Network error'), null), 0)
          return { end: vi.fn(), on: vi.fn(), pipe: vi.fn() } as any
        },
      )

      const options: CloudinaryStorageOptions = {
        ...baseOptions,
        collections: { media: true },
      }

      const handler = createUploadHandler(options)
      const file = mockFile()

      await expect(
        handler({
          collection: { slug: 'media' } as any,
          file: file as any,
          data: {},
          req: {} as any,
        }),
      ).rejects.toThrow('Failed to upload to Cloudinary: Network error')
    })

    it('should provide helpful error for quota exceeded', async () => {
      vi.mocked(cloudinary.uploader.upload_stream).mockImplementation(
        (options: any, callback: any) => {
          const error = new Error('Account has reached its quota')
          setTimeout(() => callback(error, null), 0)
          return { end: vi.fn(), on: vi.fn(), pipe: vi.fn() } as any
        },
      )

      const options: CloudinaryStorageOptions = {
        ...baseOptions,
        collections: { media: true },
      }

      const handler = createUploadHandler(options)
      const file = mockFile()

      await expect(
        handler({
          collection: { slug: 'media' } as any,
          file: file as any,
          data: {},
          req: {} as any,
        }),
      ).rejects.toThrow('quota')
    })
  })
})

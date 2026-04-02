import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createUploadHandler } from '../src/handlers/handleUpload'
import { v2 as cloudinary } from 'cloudinary'

// Mock cloudinary with all methods used by handleUpload
vi.mock('cloudinary', () => ({
  v2: {
    config: vi.fn(() => ({
      cloud_name: 'test-cloud',
      api_key: 'test-key',
      api_secret: 'test-secret',
    })),
    uploader: {
      upload_stream: vi.fn(),
      upload_large_stream: vi.fn(),
    },
    url: vi.fn((publicId, options) => {
      return `https://res.cloudinary.com/test-cloud/image/upload/${publicId}`
    }),
  },
}))

describe('Upload Handler', () => {
  const mockOptions = {
    cloudConfig: {
      cloud_name: 'test-cloud',
      api_key: 'test-key',
      api_secret: 'test-secret',
    },
    collections: {
      media: true,
      avatars: {
        folder: 'avatars',
        transformations: {
          quality: 'auto',
        },
      },
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should upload file successfully', async () => {
    const mockUploadStream = {
      end: vi.fn(),
      on: vi.fn(),
    }

    const uploadStreamMock = vi.fn((options, callback) => {
      setTimeout(() => {
        callback(null, {
          public_id: 'test-id',
          secure_url: 'https://res.cloudinary.com/test-cloud/image/upload/test-id',
          url: 'http://res.cloudinary.com/test-cloud/image/upload/test-id',
          version: 1234567890,
          format: 'jpg',
          resource_type: 'image',
          type: 'upload',
          bytes: 4,
        })
      }, 0)
      return mockUploadStream
    })

    vi.mocked(cloudinary.uploader.upload_stream).mockImplementation(uploadStreamMock)

    const handler = createUploadHandler(mockOptions)

    const mockFile = {
      buffer: Buffer.from('test'),
      filename: 'test.jpg',
      filesize: 4,
      mimeType: 'image/jpeg',
    }

    const mockCollection = {
      slug: 'media',
    }

    const result = await handler({
      collection: mockCollection as any,
      file: mockFile,
      data: {},
      req: {} as any,
    })

    expect(uploadStreamMock).toHaveBeenCalledWith(
      { resource_type: 'auto' },
      expect.any(Function),
    )
    expect(mockUploadStream.end).toHaveBeenCalledWith(mockFile.buffer)
    expect(result.cloudinaryPublicId).toBe('test-id')
  })

  it('should apply collection-specific options', async () => {
    const mockUploadStream = {
      end: vi.fn(),
      on: vi.fn(),
    }

    const uploadStreamMock = vi.fn((options, callback) => {
      setTimeout(() => {
        callback(null, {
          public_id: 'test-id',
          secure_url: 'https://res.cloudinary.com/test-cloud/image/upload/avatars/test-id',
          url: 'http://res.cloudinary.com/test-cloud/image/upload/avatars/test-id',
          version: 1234567890,
          format: 'jpg',
          resource_type: 'image',
          type: 'upload',
          bytes: 4,
        })
      }, 0)
      return mockUploadStream
    })

    vi.mocked(cloudinary.uploader.upload_stream).mockImplementation(uploadStreamMock)

    const handler = createUploadHandler(mockOptions)

    const mockFile = {
      buffer: Buffer.from('test'),
      filename: 'avatar.jpg',
      filesize: 4,
      mimeType: 'image/jpeg',
    }

    const mockCollection = {
      slug: 'avatars',
    }

    await handler({
      collection: mockCollection as any,
      file: mockFile,
      data: {},
      req: {} as any,
    })

    expect(uploadStreamMock).toHaveBeenCalledWith(
      {
        resource_type: 'auto',
        folder: 'avatars',
        transformation: { quality: 'auto' },
      },
      expect.any(Function),
    )
  })

  it('should handle upload errors', async () => {
    const uploadStreamMock = vi.fn((options, callback) => {
      setTimeout(() => {
        callback(new Error('Upload failed'))
      }, 0)
      return { end: vi.fn(), on: vi.fn() }
    })

    vi.mocked(cloudinary.uploader.upload_stream).mockImplementation(uploadStreamMock)

    const handler = createUploadHandler(mockOptions)

    await expect(
      handler({
        collection: { slug: 'media' } as any,
        file: {
          buffer: Buffer.from('test'),
          filename: 'test.jpg',
          filesize: 4,
          mimeType: 'image/jpeg',
        },
        data: {},
        req: {} as any,
      }),
    ).rejects.toThrow('Failed to upload to Cloudinary: Upload failed')
  })
})

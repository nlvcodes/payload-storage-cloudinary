import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createUploadHandler } from '../src/handlers/handleUpload'
import { v2 as cloudinary } from 'cloudinary'

// Mock cloudinary
vi.mock('cloudinary', () => ({
  v2: {
    uploader: {
      upload_stream: vi.fn(),
    },
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
    }
    
    const uploadStreamMock = vi.fn((options, callback) => {
      // Simulate successful upload
      setTimeout(() => {
        callback(null, { public_id: 'test-id', url: 'test-url' })
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
    
    await handler({
      collection: mockCollection as any,
      file: mockFile,
      data: {},
      req: {} as any,
      clientUploadContext: undefined,
    })
    
    expect(uploadStreamMock).toHaveBeenCalledWith(
      { resource_type: 'auto' },
      expect.any(Function)
    )
    expect(mockUploadStream.end).toHaveBeenCalledWith(mockFile.buffer)
  })

  it('should apply collection-specific options', async () => {
    const mockUploadStream = {
      end: vi.fn(),
    }
    
    const uploadStreamMock = vi.fn((options, callback) => {
      setTimeout(() => {
        callback(null, { public_id: 'test-id', url: 'test-url' })
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
      clientUploadContext: undefined,
    })
    
    expect(uploadStreamMock).toHaveBeenCalledWith(
      {
        resource_type: 'auto',
        folder: 'avatars',
        transformation: { quality: 'auto' },
      },
      expect.any(Function)
    )
  })

  it('should handle upload errors', async () => {
    const uploadStreamMock = vi.fn((options, callback) => {
      setTimeout(() => {
        callback(new Error('Upload failed'))
      }, 0)
      return { end: vi.fn() }
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
        clientUploadContext: undefined,
      })
    ).rejects.toThrow('Failed to upload to Cloudinary: Upload failed')
  })
})
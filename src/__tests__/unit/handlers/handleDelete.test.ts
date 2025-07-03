import { describe, it, expect, vi, beforeEach } from 'vitest'
import { v2 as cloudinary } from 'cloudinary'
import { createDeleteHandler } from '../../../handlers/handleDelete'
import type { CloudinaryStorageOptions } from '../../../types'

describe('handleDelete', () => {
  const mockOptions: CloudinaryStorageOptions = {
    cloudConfig: {
      cloud_name: 'test-cloud',
      api_key: 'test-key',
      api_secret: 'test-secret',
    },
    collections: {
      media: {
        deleteFromCloudinary: true,
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

  it('should delete file from Cloudinary when deleteFromCloudinary is true', async () => {
    vi.mocked(cloudinary.uploader.destroy).mockResolvedValue({
      result: 'ok',
    } as any)

    const handler = createDeleteHandler(mockOptions)
    const doc = {
      cloudinaryPublicId: 'test-public-id',
      cloudinaryResourceType: 'image',
    }

    await handler({ 
      collection: mockCollection as any, 
      doc, 
      filename: 'test.jpg' 
    })

    expect(cloudinary.uploader.destroy).toHaveBeenCalledWith(
      'test-public-id',
      { resource_type: 'image' }
    )
  })

  it('should not delete when deleteFromCloudinary is false', async () => {
    const optionsWithNoDelete: CloudinaryStorageOptions = {
      ...mockOptions,
      collections: {
        media: {
          deleteFromCloudinary: false,
        },
      },
    }

    const handler = createDeleteHandler(optionsWithNoDelete)
    const doc = {
      cloudinaryPublicId: 'test-public-id',
      cloudinaryResourceType: 'image',
    }

    await handler({ 
      collection: mockCollection as any, 
      doc, 
      filename: 'test.jpg' 
    })

    expect(cloudinary.uploader.destroy).not.toHaveBeenCalled()
  })

  it('should extract public ID from URL if not in document', async () => {
    vi.mocked(cloudinary.uploader.destroy).mockResolvedValue({
      result: 'ok',
    } as any)

    const handler = createDeleteHandler(mockOptions)
    const doc = {
      url: 'https://res.cloudinary.com/test/image/upload/v1234567890/folder/test-image.jpg',
    }

    await handler({ 
      collection: mockCollection as any, 
      doc, 
      filename: 'test.jpg' 
    })

    expect(cloudinary.uploader.destroy).toHaveBeenCalledWith(
      'folder/test-image',
      { resource_type: 'image' }
    )
  })

  it('should handle delete errors gracefully', async () => {
    vi.mocked(cloudinary.uploader.destroy).mockRejectedValue(
      new Error('Delete failed')
    )

    const handler = createDeleteHandler(mockOptions)
    const doc = {
      cloudinaryPublicId: 'test-public-id',
      cloudinaryResourceType: 'image',
    }

    // Should not throw
    await expect(
      handler({ 
        collection: mockCollection as any, 
        doc, 
        filename: 'test.jpg' 
      })
    ).resolves.not.toThrow()

    expect(cloudinary.uploader.destroy).toHaveBeenCalled()
  })

  it('should use default resource type when not specified', async () => {
    vi.mocked(cloudinary.uploader.destroy).mockResolvedValue({
      result: 'ok',
    } as any)

    const optionsWithResourceType: CloudinaryStorageOptions = {
      ...mockOptions,
      collections: {
        media: {
          resourceType: 'video',
        },
      },
    }

    const handler = createDeleteHandler(optionsWithResourceType)
    const doc = {
      cloudinaryPublicId: 'test-public-id',
      // No cloudinaryResourceType in doc
    }

    await handler({ 
      collection: mockCollection as any, 
      doc, 
      filename: 'test.mp4' 
    })

    expect(cloudinary.uploader.destroy).toHaveBeenCalledWith(
      'test-public-id',
      { resource_type: 'video' }
    )
  })

  it('should handle missing Cloudinary info', async () => {
    const handler = createDeleteHandler(mockOptions)
    const doc = {
      // No Cloudinary fields
      filename: 'test.jpg',
    }

    // Should not throw
    await expect(
      handler({ 
        collection: mockCollection as any, 
        doc, 
        filename: 'test.jpg' 
      })
    ).resolves.not.toThrow()

    expect(cloudinary.uploader.destroy).not.toHaveBeenCalled()
  })
})
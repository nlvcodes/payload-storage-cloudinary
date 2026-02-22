import { describe, it, expect, vi, beforeEach } from 'vitest'
import { v2 as cloudinary } from 'cloudinary'
import { createURLGenerator } from '../../../handlers/generateURL'
import type { CloudinaryStorageOptions } from '../../../types'

describe('generateURL', () => {
  const mockOptions: CloudinaryStorageOptions = {
    cloudConfig: {
      cloud_name: 'test-cloud',
      api_key: 'test-key',
      api_secret: 'test-secret',
    },
    collections: {
      media: true,
    },
  }

  const mockCollection = {
    slug: 'media',
    config: {},
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return correct URL for valid publicId', () => {
    const generator = createURLGenerator(mockOptions)
    const result = generator({
      collection: mockCollection as any,
      filename: 'test.jpg',
      prefix: '',
      data: {
        cloudinaryPublicId: 'my-folder/my-image',
        cloudinaryVersion: 1234567890,
      },
    })

    expect(result).toContain('my-folder/my-image')
  })

  it('should return filename when collection is not configured', () => {
    const generator = createURLGenerator({
      ...mockOptions,
      collections: {},
    })
    const result = generator({
      collection: mockCollection as any,
      filename: 'test.jpg',
      prefix: '',
      data: {},
    })

    expect(result).toBe('test.jpg')
  })

  it('should return filename when cloudinary.url() throws', () => {
    vi.mocked(cloudinary.url).mockImplementation(() => {
      throw new Error('URL generation failed')
    })

    const generator = createURLGenerator(mockOptions)
    const result = generator({
      collection: mockCollection as any,
      filename: 'test.jpg',
      prefix: '',
      data: {},
    })

    expect(result).toBe('test.jpg')
  })

  it('should return stored cloudinaryUrl directly', () => {
    const generator = createURLGenerator(mockOptions)
    const result = generator({
      collection: mockCollection as any,
      filename: 'test.jpg',
      prefix: '',
      data: {
        cloudinaryUrl: 'https://res.cloudinary.com/test/image/upload/stored-url.jpg',
      },
    })

    expect(result).toBe('https://res.cloudinary.com/test/image/upload/stored-url.jpg')
  })
})

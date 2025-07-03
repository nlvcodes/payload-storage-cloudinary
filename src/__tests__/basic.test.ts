import { describe, it, expect, beforeEach, vi } from 'vitest'
import { cloudinaryStorage } from '../index'

// Mock the cloudinary module
vi.mock('cloudinary')

// Mock the cloud storage plugin
vi.mock('@payloadcms/plugin-cloud-storage', () => ({
  cloudStoragePlugin: vi.fn((config) => ({ ...config, _type: 'plugin' }))
}))

describe('Basic Plugin Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should create plugin with valid configuration', () => {
    const options = {
      cloudConfig: {
        cloud_name: 'test-cloud',
        api_key: 'test-key',
        api_secret: 'test-secret',
      },
      collections: {
        media: true,
      },
    }

    const plugin = cloudinaryStorage(options)
    expect(plugin).toBeDefined()
    // The plugin returns whatever cloudStoragePlugin returns
    expect(plugin).toHaveProperty('collections')
  })

  it('should validate cloud config', () => {
    expect(() => {
      cloudinaryStorage({
        collections: { media: true },
      } as any)
    }).toThrow('Cloudinary cloud_name, api_key, and api_secret are required')
  })

  it('should validate collections', () => {
    expect(() => {
      cloudinaryStorage({
        cloudConfig: {
          cloud_name: 'test',
          api_key: 'test',
          api_secret: 'test',
        },
        collections: {},
      })
    }).toThrow('At least one collection must be configured')
  })
})
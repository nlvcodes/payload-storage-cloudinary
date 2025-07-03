import { describe, it, expect, vi, beforeEach } from 'vitest'
import { cloudinaryStorage } from '../../index'
import type { CloudinaryStorageOptions } from '../../types'

// Get the mocked cloudStoragePlugin from our mock
const cloudStoragePluginMock = vi.hoisted(() => vi.fn((config) => ({ ...config, _type: 'plugin' })))
vi.mock('@payloadcms/plugin-cloud-storage', () => ({
  cloudStoragePlugin: cloudStoragePluginMock,
}))

describe('cloudinaryStorage plugin integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should create plugin with minimal configuration', () => {
    const options: CloudinaryStorageOptions = {
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
    expect(cloudStoragePluginMock).toHaveBeenCalledWith(
      expect.objectContaining({
        collections: expect.objectContaining({
          media: expect.objectContaining({
            adapter: expect.any(Object),
            generateFileURL: expect.any(Function),
          }),
        }),
      })
    )
  })

  it('should handle multiple collections with different configs', () => {
    const options: CloudinaryStorageOptions = {
      cloudConfig: {
        cloud_name: 'test-cloud',
        api_key: 'test-key',
        api_secret: 'test-secret',
      },
      collections: {
        media: {
          folder: 'media',
          transformations: {
            quality: 'auto',
          },
        },
        documents: {
          folder: 'documents',
          privateFiles: true,
          resourceType: 'raw',
        },
        videos: {
          folder: 'videos',
          resourceType: 'video',
          uploadQueue: {
            enabled: true,
            largeFileThreshold: 50,
          },
        },
      },
    }

    const plugin = cloudinaryStorage(options)

    expect(plugin).toBeDefined()
    expect(cloudStoragePluginMock).toHaveBeenCalledWith(
      expect.objectContaining({
        collections: expect.objectContaining({
          media: expect.any(Object),
          documents: expect.any(Object),
          videos: expect.any(Object),
        }),
      })
    )
  })

  it('should throw error without cloud config', () => {
    const invalidOptions = {
      collections: { media: true },
    } as any

    expect(() => cloudinaryStorage(invalidOptions)).toThrow(
      'Cloudinary cloud_name, api_key, and api_secret are required'
    )
  })

  it('should throw error with missing cloud credentials', () => {
    const invalidOptions = {
      cloudConfig: {
        cloud_name: 'test-cloud',
        // Missing api_key and api_secret
      },
      collections: { media: true },
    } as any

    expect(() => cloudinaryStorage(invalidOptions)).toThrow(
      'Cloudinary cloud_name, api_key, and api_secret are required'
    )
  })

  it('should throw error without collections', () => {
    const invalidOptions = {
      cloudConfig: {
        cloud_name: 'test-cloud',
        api_key: 'test-key',
        api_secret: 'test-secret',
      },
      // Missing collections
    } as any

    expect(() => cloudinaryStorage(invalidOptions)).toThrow(
      'At least one collection must be configured for Cloudinary storage'
    )
  })

  it('should configure endpoints for collections with private files', () => {
    const options: CloudinaryStorageOptions = {
      cloudConfig: {
        cloud_name: 'test-cloud',
        api_key: 'test-key',
        api_secret: 'test-secret',
      },
      collections: {
        media: {
          privateFiles: true,
        },
        public: true, // No private files
      },
    }

    cloudinaryStorage(options)

    const pluginCall = cloudStoragePluginMock.mock.calls[0][0]
    
    // Should have endpoints for media (private) but not public
    expect(pluginCall.collections.media).toHaveProperty('endpoints')
    expect(pluginCall.collections.media.endpoints).toHaveLength(2) // signed-url and batch
    expect(pluginCall.collections.public).not.toHaveProperty('endpoints')
  })

  it('should add fields for dynamic folders', () => {
    const options: CloudinaryStorageOptions = {
      cloudConfig: {
        cloud_name: 'test-cloud',
        api_key: 'test-key',
        api_secret: 'test-secret',
      },
      collections: {
        media: {
          folder: {
            path: 'default',
            enableDynamic: true,
            fieldName: 'customFolder',
          },
        },
      },
    }

    cloudinaryStorage(options)

    const pluginCall = cloudStoragePluginMock.mock.calls[0][0]
    
    expect(pluginCall.collections.media).toHaveProperty('fields')
    expect(pluginCall.collections.media.fields).toContainEqual(
      expect.objectContaining({
        name: 'customFolder',
        type: 'text',
        label: 'Cloudinary Folder',
      })
    )
  })

  it('should add fields for transformation preset selection', () => {
    const options: CloudinaryStorageOptions = {
      cloudConfig: {
        cloud_name: 'test-cloud',
        api_key: 'test-key',
        api_secret: 'test-secret',
      },
      collections: {
        media: {
          transformations: {
            presets: {
              thumbnail: { width: 150, height: 150 },
              card: { width: 400, height: 400 },
            },
            enablePresetSelection: true,
          },
        },
      },
    }

    cloudinaryStorage(options)

    const pluginCall = cloudStoragePluginMock.mock.calls[0][0]
    
    expect(pluginCall.collections.media).toHaveProperty('fields')
    expect(pluginCall.collections.media.fields).toContainEqual(
      expect.objectContaining({
        name: 'transformationPreset',
        type: 'select',
        options: expect.arrayContaining([
          { label: 'Thumbnail', value: 'thumbnail' },
          { label: 'Card', value: 'card' },
        ]),
      })
    )
  })

  it('should skip field creation when configured', () => {
    const options: CloudinaryStorageOptions = {
      cloudConfig: {
        cloud_name: 'test-cloud',
        api_key: 'test-key',
        api_secret: 'test-secret',
      },
      collections: {
        media: {
          folder: {
            path: 'default',
            enableDynamic: true,
            skipFieldCreation: true, // Should not create field
          },
        },
      },
    }

    cloudinaryStorage(options)

    const pluginCall = cloudStoragePluginMock.mock.calls[0][0]
    
    // Should not have fields array or should be empty
    expect(pluginCall.collections.media.fields || []).toHaveLength(0)
  })

  it('should normalize boolean configuration', () => {
    const options: CloudinaryStorageOptions = {
      cloudConfig: {
        cloud_name: 'test-cloud',
        api_key: 'test-key',
        api_secret: 'test-secret',
      },
      collections: {
        media: true, // Simple boolean config
      },
    }

    cloudinaryStorage(options)

    const pluginCall = cloudStoragePluginMock.mock.calls[0][0]
    
    expect(pluginCall.collections.media).toBeDefined()
    expect(pluginCall.collections.media.adapter).toBeDefined()
    expect(pluginCall.collections.media.generateFileURL).toBeDefined()
  })
})
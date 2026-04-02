import { describe, it, expect, vi } from 'vitest'
import { cloudinaryStorage } from '../../index'
import type { CloudinaryStorageOptions } from '../../types'

describe('cloudinaryStorage plugin integration', () => {
  const validCloudConfig = {
    cloud_name: 'test-cloud',
    api_key: 'test-key',
    api_secret: 'test-secret',
  }

  describe('validation', () => {
    it('should throw error without cloud config', () => {
      expect(() => cloudinaryStorage({ collections: { media: true } } as any)).toThrow(
        'Cloudinary cloud_name, api_key, and api_secret are required',
      )
    })

    it('should throw error with missing cloud credentials', () => {
      expect(() =>
        cloudinaryStorage({
          cloudConfig: { cloud_name: 'test-cloud' },
          collections: { media: true },
        } as any),
      ).toThrow('Cloudinary cloud_name, api_key, and api_secret are required')
    })

    it('should throw error without collections', () => {
      expect(() =>
        cloudinaryStorage({
          cloudConfig: validCloudConfig,
        } as any),
      ).toThrow('At least one collection must be configured for Cloudinary storage')
    })

    it('should throw error with empty collections', () => {
      expect(() =>
        cloudinaryStorage({
          cloudConfig: validCloudConfig,
          collections: {},
        }),
      ).toThrow('At least one collection must be configured for Cloudinary storage')
    })
  })

  describe('plugin creation', () => {
    it('should create plugin that returns a function', () => {
      const plugin = cloudinaryStorage({
        cloudConfig: validCloudConfig,
        collections: { media: true },
      })

      expect(typeof plugin).toBe('function')
    })

    it('should handle multiple collections', () => {
      const plugin = cloudinaryStorage({
        cloudConfig: validCloudConfig,
        collections: {
          media: { folder: 'media' },
          documents: { folder: 'documents', privateFiles: true, resourceType: 'raw' },
          videos: { folder: 'videos', resourceType: 'video' },
        },
      })

      expect(typeof plugin).toBe('function')
    })

    it('should normalize boolean configuration', () => {
      // Should not throw when using boolean config
      const plugin = cloudinaryStorage({
        cloudConfig: validCloudConfig,
        collections: { media: true },
      })

      expect(typeof plugin).toBe('function')
    })
  })

  describe('plugin application', () => {
    it('should configure endpoints for collections with private files', () => {
      const plugin = cloudinaryStorage({
        cloudConfig: validCloudConfig,
        collections: {
          media: { privateFiles: true },
          public: true,
        },
      })

      const mockConfig = {
        collections: [
          { slug: 'media', endpoints: [], hooks: {} },
          { slug: 'public', endpoints: [], hooks: {} },
        ],
      }

      const result = plugin(mockConfig as any)

      // Media collection should have signed URL endpoints
      const mediaCollection = result.collections?.find((c: any) => c.slug === 'media')
      expect(mediaCollection).toBeDefined()
      expect(mediaCollection?.endpoints?.length).toBeGreaterThanOrEqual(2)

      // Public collection should not have signed URL endpoints added
      const publicCollection = result.collections?.find((c: any) => c.slug === 'public')
      expect(publicCollection?.endpoints?.length).toBe(0)
    })

    it('should add hooks for all configured collections', () => {
      const plugin = cloudinaryStorage({
        cloudConfig: validCloudConfig,
        collections: { media: true },
      })

      const mockConfig = {
        collections: [{ slug: 'media', endpoints: [], hooks: {} }],
      }

      const result = plugin(mockConfig as any)

      const mediaCollection = result.collections?.find((c: any) => c.slug === 'media')
      expect(mediaCollection?.hooks?.beforeValidate?.length).toBeGreaterThanOrEqual(1)
      expect(mediaCollection?.hooks?.beforeChange?.length).toBeGreaterThanOrEqual(1)
    })

    it('should add afterChange hook for private files collections', () => {
      const plugin = cloudinaryStorage({
        cloudConfig: validCloudConfig,
        collections: { media: { privateFiles: true } },
      })

      const mockConfig = {
        collections: [{ slug: 'media', endpoints: [], hooks: {} }],
      }

      const result = plugin(mockConfig as any)

      const mediaCollection = result.collections?.find((c: any) => c.slug === 'media')
      expect(mediaCollection?.hooks?.afterChange?.length).toBeGreaterThanOrEqual(1)
    })

    it('should not modify unconfigured collections', () => {
      const plugin = cloudinaryStorage({
        cloudConfig: validCloudConfig,
        collections: { media: true },
      })

      const mockConfig = {
        collections: [
          { slug: 'media', endpoints: [], hooks: {} },
          { slug: 'other', endpoints: [{ path: '/existing' }], hooks: {} },
        ],
      }

      const result = plugin(mockConfig as any)

      const otherCollection = result.collections?.find((c: any) => c.slug === 'other')
      expect(otherCollection?.endpoints).toEqual([{ path: '/existing' }])
    })
  })
})

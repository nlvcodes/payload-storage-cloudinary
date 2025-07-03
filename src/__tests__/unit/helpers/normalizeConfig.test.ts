import { describe, it, expect } from 'vitest'
import { 
  normalizeCollectionConfig, 
  getFolderConfig,
  getTransformationConfig,
  getSignedURLConfig,
  getUploadQueueConfig,
} from '../../../helpers/normalizeConfig'
import type { CloudinaryCollectionConfig } from '../../../types'

describe('normalizeConfig helpers', () => {
  describe('normalizeCollectionConfig', () => {
    it('should handle boolean config', () => {
      const result = normalizeCollectionConfig(true)
      
      expect(result).toEqual({
        deleteFromCloudinary: true,
        resourceType: 'auto',
      })
    })

    it('should handle empty object config', () => {
      const result = normalizeCollectionConfig({})
      
      expect(result).toEqual({
        deleteFromCloudinary: true,
        resourceType: 'auto',
      })
    })

    it('should normalize legacy signedURLs to privateFiles', () => {
      const config: CloudinaryCollectionConfig = {
        signedURLs: {
          enabled: true,
          expiresIn: 7200,
        },
      }
      
      const result = normalizeCollectionConfig(config)
      
      expect(result).toHaveProperty('privateFiles', {
        enabled: true,
        expiresIn: 7200,
      })
      expect(result).not.toHaveProperty('signedURLs')
    })

    it('should normalize boolean privateFiles', () => {
      const config: CloudinaryCollectionConfig = {
        privateFiles: true,
      }
      
      const result = normalizeCollectionConfig(config)
      
      expect(result.privateFiles).toEqual({
        enabled: true,
        expiresIn: 3600,
      })
    })

    it('should normalize string folder to object', () => {
      const config: CloudinaryCollectionConfig = {
        folder: 'my-folder',
      }
      
      const result = normalizeCollectionConfig(config)
      
      expect(result.folder).toEqual({
        path: 'my-folder',
        enableDynamic: false,
        fieldName: 'cloudinaryFolder',
      })
    })

    it('should normalize transformations object', () => {
      const config: CloudinaryCollectionConfig = {
        transformations: {
          width: 400,
          height: 300,
          crop: 'fill',
        },
      }
      
      const result = normalizeCollectionConfig(config)
      
      expect(result.transformations).toEqual({
        default: {
          width: 400,
          height: 300,
          crop: 'fill',
        },
      })
    })

    it('should handle complete configuration', () => {
      const config: CloudinaryCollectionConfig = {
        folder: {
          path: 'uploads',
          enableDynamic: true,
        },
        transformations: {
          default: { quality: 'auto' },
          presets: { thumbnail: { width: 150 } },
          enablePresetSelection: true,
        },
        privateFiles: {
          enabled: true,
          expiresIn: 7200,
          customAuthCheck: async () => true,
        },
        uploadQueue: {
          enabled: true,
          maxConcurrentUploads: 5,
        },
        deleteFromCloudinary: false,
        resourceType: 'video',
      }
      
      const result = normalizeCollectionConfig(config)
      
      expect(result).toMatchObject({
        folder: {
          path: 'uploads',
          enableDynamic: true,
          fieldName: 'cloudinaryFolder',
        },
        transformations: {
          default: { quality: 'auto' },
          presets: { thumbnail: { width: 150 } },
          enablePresetSelection: true,
        },
        privateFiles: {
          enabled: true,
          expiresIn: 7200,
        },
        uploadQueue: {
          enabled: true,
          maxConcurrentUploads: 5,
        },
        deleteFromCloudinary: false,
        resourceType: 'video',
      })
    })
  })

  describe('getFolderConfig', () => {
    it('should return undefined for no folder config', () => {
      const config = normalizeCollectionConfig({})
      const result = getFolderConfig(config)
      
      expect(result).toBeUndefined()
    })

    it('should return normalized folder config', () => {
      const config = normalizeCollectionConfig({ folder: 'test' })
      const result = getFolderConfig(config)
      
      expect(result).toEqual({
        path: 'test',
        enableDynamic: false,
        fieldName: 'cloudinaryFolder',
      })
    })

    it('should handle dynamic folder config', () => {
      const config = normalizeCollectionConfig({
        folder: {
          path: 'base',
          enableDynamic: true,
          fieldName: 'customFolder',
        },
      })
      const result = getFolderConfig(config)
      
      expect(result).toEqual({
        path: 'base',
        enableDynamic: true,
        fieldName: 'customFolder',
      })
    })
  })

  describe('getTransformationConfig', () => {
    it('should return undefined for no transformation config', () => {
      const config = normalizeCollectionConfig({})
      const result = getTransformationConfig(config)
      
      expect(result).toBeUndefined()
    })

    it('should return transformation config', () => {
      const config = normalizeCollectionConfig({
        transformations: {
          quality: 'auto',
          fetch_format: 'auto',
        },
      })
      const result = getTransformationConfig(config)
      
      expect(result).toEqual({
        default: {
          quality: 'auto',
          fetch_format: 'auto',
        },
      })
    })

    it('should handle preset configuration', () => {
      const config = normalizeCollectionConfig({
        transformations: {
          presets: {
            hero: { width: 1920, height: 600 },
          },
          enablePresetSelection: true,
        },
      })
      const result = getTransformationConfig(config)
      
      expect(result).toEqual({
        presets: {
          hero: { width: 1920, height: 600 },
        },
        enablePresetSelection: true,
      })
    })
  })

  describe('getSignedURLConfig', () => {
    it('should return undefined for no private files config', () => {
      const config = normalizeCollectionConfig({})
      const result = getSignedURLConfig(config)
      
      expect(result).toBeUndefined()
    })

    it('should return signed URL config for privateFiles', () => {
      const config = normalizeCollectionConfig({ privateFiles: true })
      const result = getSignedURLConfig(config)
      
      expect(result).toEqual({
        enabled: true,
        expiresIn: 3600,
      })
    })

    it('should handle custom signed URL config', () => {
      const customAuth = async () => true
      const config = normalizeCollectionConfig({
        privateFiles: {
          enabled: true,
          expiresIn: 7200,
          authTypes: ['upload', 'authenticated'],
          customAuthCheck: customAuth,
        },
      })
      const result = getSignedURLConfig(config)
      
      expect(result).toEqual({
        enabled: true,
        expiresIn: 7200,
        authTypes: ['upload', 'authenticated'],
        customAuthCheck: customAuth,
      })
    })
  })

  describe('getUploadQueueConfig', () => {
    it('should return undefined for no queue config', () => {
      const config = normalizeCollectionConfig({})
      const result = getUploadQueueConfig(config)
      
      expect(result).toBeUndefined()
    })

    it('should return default queue config when enabled', () => {
      const config = normalizeCollectionConfig({
        uploadQueue: { enabled: true },
      })
      const result = getUploadQueueConfig(config)
      
      expect(result).toEqual({
        enabled: true,
        maxConcurrentUploads: 3,
        chunkSize: 20,
        enableChunkedUploads: true,
        largeFileThreshold: 100,
      })
    })

    it('should merge custom queue config', () => {
      const config = normalizeCollectionConfig({
        uploadQueue: {
          enabled: true,
          maxConcurrentUploads: 5,
          largeFileThreshold: 200,
        },
      })
      const result = getUploadQueueConfig(config)
      
      expect(result).toEqual({
        enabled: true,
        maxConcurrentUploads: 5,
        chunkSize: 20,
        enableChunkedUploads: true,
        largeFileThreshold: 200,
      })
    })

    it('should not return config when disabled', () => {
      const config = normalizeCollectionConfig({
        uploadQueue: { enabled: false },
      })
      const result = getUploadQueueConfig(config)
      
      expect(result).toBeUndefined()
    })
  })

  describe('edge cases', () => {
    it('should handle null/undefined values gracefully', () => {
      const config: any = {
        folder: null,
        transformations: undefined,
        privateFiles: null,
        uploadQueue: undefined,
      }
      
      const result = normalizeCollectionConfig(config)
      
      expect(result).toEqual({
        deleteFromCloudinary: true,
        resourceType: 'auto',
      })
    })

    it('should preserve unknown properties', () => {
      const config: any = {
        customProperty: 'value',
        anotherProp: 123,
      }
      
      const result = normalizeCollectionConfig(config)
      
      expect(result).toMatchObject({
        customProperty: 'value',
        anotherProp: 123,
        deleteFromCloudinary: true,
        resourceType: 'auto',
      })
    })
  })
})
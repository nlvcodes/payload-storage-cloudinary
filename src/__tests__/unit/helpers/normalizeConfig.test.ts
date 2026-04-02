import { describe, it, expect } from 'vitest'
import {
  normalizeCollectionConfig,
  getFolderConfig,
  getTransformationConfig,
  getSignedURLConfig,
} from '../../../helpers/normalizeConfig'
import type { CloudinaryCollectionConfig } from '../../../types'

describe('normalizeConfig helpers', () => {
  describe('normalizeCollectionConfig', () => {
    it('should handle empty object config', () => {
      const result = normalizeCollectionConfig({})

      expect(result).toEqual({})
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

    it('should normalize string folder to object with path', () => {
      const config: CloudinaryCollectionConfig = {
        folder: 'my-folder',
      }

      const result = normalizeCollectionConfig(config)

      expect(result.folder).toEqual({
        path: 'my-folder',
      })
    })

    it('should normalize transformations without default key as legacy format', () => {
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

    it('should preserve new-format transformations with default key', () => {
      const config: CloudinaryCollectionConfig = {
        transformations: {
          default: { quality: 'auto' },
          presets: { thumbnail: { width: 150 } },
          enablePresetSelection: true,
        },
      }

      const result = normalizeCollectionConfig(config)

      expect(result.transformations).toEqual({
        default: { quality: 'auto' },
        presets: { thumbnail: { width: 150 } },
        enablePresetSelection: true,
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

    it('should map legacy enableDynamicFolders field', () => {
      const config: any = {
        enableDynamicFolders: true,
        folderField: 'myFolder',
      }

      const result = normalizeCollectionConfig(config)

      expect(result.folder).toMatchObject({
        enableDynamic: true,
        fieldName: 'myFolder',
      })
    })
  })

  describe('getFolderConfig', () => {
    it('should return empty object for no folder config', () => {
      const config = normalizeCollectionConfig({})
      const result = getFolderConfig(config)

      expect(result).toEqual({})
    })

    it('should return folder config with path for string folder', () => {
      const config = normalizeCollectionConfig({ folder: 'test' })
      const result = getFolderConfig(config)

      expect(result).toEqual({
        path: 'test',
      })
    })

    it('should handle string folder directly without normalization', () => {
      const result = getFolderConfig({ folder: 'direct-test' })

      expect(result).toEqual({
        path: 'direct-test',
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
    it('should return empty object for no transformation config', () => {
      const config = normalizeCollectionConfig({})
      const result = getTransformationConfig(config)

      expect(result).toEqual({})
    })

    it('should return transformation config with legacy format wrapped in default', () => {
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

    it('should handle preset configuration with default key', () => {
      const config = normalizeCollectionConfig({
        transformations: {
          default: { quality: 'auto' },
          presets: {
            hero: { width: 1920, height: 600 },
          },
          enablePresetSelection: true,
        },
      })
      const result = getTransformationConfig(config)

      expect(result).toEqual({
        default: { quality: 'auto' },
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

  describe('edge cases', () => {
    it('should handle null/undefined values gracefully', () => {
      const config: any = {
        folder: null,
        transformations: undefined,
        privateFiles: null,
        uploadQueue: undefined,
      }

      const result = normalizeCollectionConfig(config)

      // null/undefined values are preserved via spread, no defaults added
      expect(result).toHaveProperty('folder', null)
      expect(result).toHaveProperty('transformations', undefined)
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
      })
    })
  })
})

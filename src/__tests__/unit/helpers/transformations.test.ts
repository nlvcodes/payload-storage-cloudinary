import { describe, it, expect, vi } from 'vitest'
import { v2 as cloudinary } from 'cloudinary'
import {
  getTransformationUrl,
  commonPresets,
} from '../../../helpers/transformations'

describe('transformations helpers', () => {
  describe('getTransformationUrl', () => {
    it('should build URL with custom transformations', () => {
      const url = getTransformationUrl({
        publicId: 'my-folder/my-image',
        version: 1234567890,
        customTransformations: {
          width: 800,
          height: 600,
          crop: 'fill',
        },
      })

      // The server-side version uses cloudinary.url which is mocked
      expect(cloudinary.url).toHaveBeenCalledWith('my-folder/my-image', expect.objectContaining({
        secure: true,
        version: 1234567890,
        transformation: {
          width: 800,
          height: 600,
          crop: 'fill',
        },
      }))
      expect(typeof url).toBe('string')
    })

    it('should use preset transformations', () => {
      const presets = commonPresets
      const thumbnailPreset = presets.find(p => p.name === 'thumbnail')

      const url = getTransformationUrl({
        publicId: 'my-image',
        presetName: 'thumbnail',
        presets,
      })

      expect(cloudinary.url).toHaveBeenCalledWith('my-image', expect.objectContaining({
        secure: true,
        transformation: thumbnailPreset?.transformations,
      }))
      expect(typeof url).toBe('string')
    })

    it('should merge preset with custom transformations', () => {
      const presets = commonPresets
      const cardPreset = presets.find(p => p.name === 'card')

      const url = getTransformationUrl({
        publicId: 'my-image',
        presetName: 'card',
        presets,
        customTransformations: {
          quality: 90,
        },
      })

      expect(cloudinary.url).toHaveBeenCalledWith('my-image', expect.objectContaining({
        secure: true,
        transformation: {
          ...cardPreset?.transformations,
          quality: 90,
        },
      }))
      expect(typeof url).toBe('string')
    })

    it('should pass no transformation when no presets or custom provided', () => {
      getTransformationUrl({
        publicId: 'my-image',
      })

      expect(cloudinary.url).toHaveBeenCalledWith('my-image', expect.objectContaining({
        secure: true,
        transformation: undefined,
      }))
    })

    it('should include version when provided', () => {
      getTransformationUrl({
        publicId: 'my-image',
        version: 9999,
      })

      expect(cloudinary.url).toHaveBeenCalledWith('my-image', expect.objectContaining({
        version: 9999,
      }))
    })

    it('should not include version when not provided', () => {
      getTransformationUrl({
        publicId: 'my-image',
      })

      expect(cloudinary.url).toHaveBeenCalledWith('my-image', expect.objectContaining({
        secure: true,
      }))
      const callArgs = vi.mocked(cloudinary.url).mock.calls[0][1]
      expect(callArgs).not.toHaveProperty('version')
    })
  })

  describe('commonPresets', () => {
    it('should be an array of presets', () => {
      expect(Array.isArray(commonPresets)).toBe(true)
      expect(commonPresets.length).toBeGreaterThan(0)
    })

    it('should have all expected preset names', () => {
      const names = commonPresets.map(p => p.name)
      expect(names).toContain('thumbnail')
      expect(names).toContain('card')
      expect(names).toContain('banner')
      expect(names).toContain('og-image')
      expect(names).toContain('avatar')
      expect(names).toContain('blur')
    })

    it('should have correct thumbnail preset', () => {
      const thumbnail = commonPresets.find(p => p.name === 'thumbnail')
      expect(thumbnail).toBeDefined()
      expect(thumbnail?.transformations).toEqual({
        width: 150,
        height: 150,
        crop: 'thumb',
        gravity: 'auto',
      })
    })

    it('should have correct avatar preset with face detection', () => {
      const avatar = commonPresets.find(p => p.name === 'avatar')
      expect(avatar).toBeDefined()
      expect(avatar?.transformations).toMatchObject({
        width: 200,
        height: 200,
        crop: 'thumb',
        gravity: 'face',
        radius: 'max',
      })
    })

    it('should have category and label on each preset', () => {
      commonPresets.forEach(preset => {
        expect(preset).toHaveProperty('name')
        expect(preset).toHaveProperty('label')
        expect(preset).toHaveProperty('category')
        expect(preset).toHaveProperty('transformations')
      })
    })
  })
})

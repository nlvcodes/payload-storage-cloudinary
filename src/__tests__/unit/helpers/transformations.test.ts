import { describe, it, expect } from 'vitest'
import { 
  transformationToString, 
  getTransformationUrl,
  commonPresets,
  applyTransformationsToUrl,
  buildCloudinaryUrl,
} from '../../../helpers/transformations'

describe('transformations helpers', () => {
  describe('transformationToString', () => {
    it('should convert transformation object to string', () => {
      const transformation = {
        width: 400,
        height: 300,
        crop: 'fill',
        quality: 'auto',
        fetch_format: 'auto',
      }

      const result = transformationToString(transformation)
      
      expect(result).toBe('w_400,h_300,c_fill,q_auto,f_auto')
    })

    it('should handle nested transformations', () => {
      const transformation = {
        width: 400,
        height: 300,
        overlay: {
          text: 'Hello World',
          font_family: 'Arial',
          font_size: 20,
        },
      }

      const result = transformationToString(transformation)
      
      expect(result).toContain('w_400,h_300')
      expect(result).toContain('l_text:Arial_20:Hello%20World')
    })

    it('should handle array transformations', () => {
      const transformation = {
        transformation: [
          { width: 400, height: 300 },
          { overlay: 'logo', gravity: 'south_east' },
        ],
      }

      const result = transformationToString(transformation)
      
      expect(result).toBe('w_400,h_300/l_logo,g_south_east')
    })

    it('should encode special characters in text overlays', () => {
      const transformation = {
        overlay: {
          text: 'Hello & Goodbye!',
        },
      }

      const result = transformationToString(transformation)
      
      expect(result).toBe('l_text:Hello%20%26%20Goodbye!')
    })
  })

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

      expect(url).toBe(
        'https://res.cloudinary.com/demo/image/upload/w_800,h_600,c_fill/v1234567890/my-folder/my-image'
      )
    })

    it('should use preset transformations', () => {
      const url = getTransformationUrl({
        publicId: 'my-image',
        presetName: 'thumbnail',
        presets: commonPresets,
      })

      expect(url).toContain('w_150,h_150,c_thumb')
    })

    it('should merge preset with custom transformations', () => {
      const url = getTransformationUrl({
        publicId: 'my-image',
        presetName: 'card',
        presets: commonPresets,
        customTransformations: {
          quality: 90,
        },
      })

      expect(url).toContain('w_400,h_400,c_fill')
      expect(url).toContain('q_90')
    })

    it('should handle format in public ID', () => {
      const url = getTransformationUrl({
        publicId: 'my-image.jpg',
        format: 'webp',
        customTransformations: {
          quality: 'auto',
        },
      })

      expect(url).toContain('f_webp')
      expect(url).toContain('/my-image.webp')
    })

    it('should include cloud name when provided', () => {
      const url = getTransformationUrl({
        publicId: 'my-image',
        cloudName: 'my-cloud',
        customTransformations: {
          width: 400,
        },
      })

      expect(url).toBe(
        'https://res.cloudinary.com/my-cloud/image/upload/w_400/my-image'
      )
    })
  })

  describe('applyTransformationsToUrl', () => {
    it('should apply transformations to existing URL', () => {
      const originalUrl = 'https://res.cloudinary.com/demo/image/upload/v123/my-image.jpg'
      const result = applyTransformationsToUrl(originalUrl, {
        width: 800,
        height: 600,
        crop: 'fill',
      })

      expect(result).toBe(
        'https://res.cloudinary.com/demo/image/upload/w_800,h_600,c_fill/v123/my-image.jpg'
      )
    })

    it('should replace existing transformations', () => {
      const originalUrl = 'https://res.cloudinary.com/demo/image/upload/w_400,h_300/v123/my-image.jpg'
      const result = applyTransformationsToUrl(originalUrl, {
        width: 800,
        height: 600,
      })

      expect(result).toBe(
        'https://res.cloudinary.com/demo/image/upload/w_800,h_600/v123/my-image.jpg'
      )
    })

    it('should handle URLs without transformations', () => {
      const originalUrl = 'https://res.cloudinary.com/demo/image/upload/my-image.jpg'
      const result = applyTransformationsToUrl(originalUrl, {
        quality: 'auto',
      })

      expect(result).toBe(
        'https://res.cloudinary.com/demo/image/upload/q_auto/my-image.jpg'
      )
    })
  })

  describe('buildCloudinaryUrl', () => {
    it('should build complete URL from parts', () => {
      const url = buildCloudinaryUrl({
        cloudName: 'my-cloud',
        resourceType: 'video',
        publicId: 'my-folder/my-video',
        version: 1234567890,
        transformations: {
          width: 1920,
          height: 1080,
          video_codec: 'h264',
        },
        format: 'mp4',
      })

      expect(url).toBe(
        'https://res.cloudinary.com/my-cloud/video/upload/w_1920,h_1080,vc_h264/v1234567890/my-folder/my-video.mp4'
      )
    })

    it('should handle raw resource type', () => {
      const url = buildCloudinaryUrl({
        cloudName: 'my-cloud',
        resourceType: 'raw',
        publicId: 'documents/my-file.pdf',
      })

      expect(url).toBe(
        'https://res.cloudinary.com/my-cloud/raw/upload/documents/my-file.pdf'
      )
    })

    it('should apply default transformations', () => {
      const url = buildCloudinaryUrl({
        cloudName: 'my-cloud',
        publicId: 'my-image',
      })

      expect(url).toBe(
        'https://res.cloudinary.com/my-cloud/image/upload/my-image'
      )
    })
  })

  describe('commonPresets', () => {
    it('should have all expected presets', () => {
      expect(commonPresets).toHaveProperty('thumbnail')
      expect(commonPresets).toHaveProperty('card')
      expect(commonPresets).toHaveProperty('banner')
      expect(commonPresets).toHaveProperty('og-image')
      expect(commonPresets).toHaveProperty('avatar')
      expect(commonPresets).toHaveProperty('blur')
    })

    it('should have correct thumbnail preset', () => {
      expect(commonPresets.thumbnail).toEqual({
        width: 150,
        height: 150,
        crop: 'thumb',
        gravity: 'auto',
        quality: 'auto',
        fetch_format: 'auto',
      })
    })

    it('should have correct avatar preset with circular crop', () => {
      expect(commonPresets.avatar).toMatchObject({
        width: 200,
        height: 200,
        crop: 'fill',
        gravity: 'face',
        radius: 'max',
      })
    })
  })
})
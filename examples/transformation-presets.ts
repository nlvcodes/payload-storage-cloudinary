import { cloudinaryStorage, commonPresets } from 'payload-storage-cloudinary'

// Example 1: Using built-in presets
export const basicPresetConfig = cloudinaryStorage({
  cloudConfig: {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
    api_key: process.env.CLOUDINARY_API_KEY!,
    api_secret: process.env.CLOUDINARY_API_SECRET!,
  },
  collections: {
    media: {
      enablePresetSelection: true,
      transformationPresets: commonPresets,
    },
  },
})

// Example 2: Custom presets
export const customPresetConfig = cloudinaryStorage({
  cloudConfig: {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
    api_key: process.env.CLOUDINARY_API_KEY!,
    api_secret: process.env.CLOUDINARY_API_SECRET!,
  },
  collections: {
    media: {
      enablePresetSelection: true,
      transformationPresets: [
        {
          name: 'blog-hero',
          label: 'Blog Hero Image',
          description: 'Optimized for blog post headers',
          transformations: {
            width: 1200,
            height: 630,
            crop: 'fill',
            gravity: 'center',
            quality: 'auto:best',
            fetch_format: 'auto',
            effect: 'improve:outdoor',
          },
        },
        {
          name: 'product-thumb',
          label: 'Product Thumbnail',
          description: 'Square thumbnail for product grids',
          transformations: {
            width: 300,
            height: 300,
            crop: 'fill',
            gravity: 'auto',
            quality: 'auto',
            fetch_format: 'auto',
            background: 'white',
            pad: true,
          },
        },
        {
          name: 'social-share',
          label: 'Social Media Share',
          description: 'Optimized for social media sharing',
          transformations: {
            width: 1200,
            height: 630,
            crop: 'fill',
            gravity: 'face:center',
            quality: 'auto:good',
            fetch_format: 'auto',
            overlay: {
              font_family: 'Arial',
              font_size: 60,
              font_weight: 'bold',
              text: 'Visit Our Site',
              color: 'white',
              background: 'rgb:00000080',
              padding: 20,
            },
            gravity: 'south',
            y: 50,
          },
        },
        {
          name: 'avatar',
          label: 'User Avatar',
          description: 'Circular avatar for user profiles',
          transformations: {
            width: 200,
            height: 200,
            crop: 'fill',
            gravity: 'face',
            radius: 'max',
            quality: 'auto',
            fetch_format: 'auto',
            border: '3px_solid_rgb:ffffff',
          },
        },
      ],
    },
  },
})

// Example 3: Different presets for different collections
export const multiCollectionConfig = cloudinaryStorage({
  cloudConfig: {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
    api_key: process.env.CLOUDINARY_API_KEY!,
    api_secret: process.env.CLOUDINARY_API_SECRET!,
  },
  collections: {
    blogImages: {
      enablePresetSelection: true,
      transformationPresets: [
        {
          name: 'hero',
          label: 'Hero Image',
          transformations: {
            width: 1920,
            height: 800,
            crop: 'fill',
            quality: 'auto:best',
          },
        },
        {
          name: 'inline',
          label: 'Inline Image',
          transformations: {
            width: 800,
            quality: 'auto',
          },
        },
      ],
    },
    productImages: {
      enablePresetSelection: true,
      transformationPresets: [
        {
          name: 'main',
          label: 'Main Product Image',
          transformations: {
            width: 1000,
            height: 1000,
            crop: 'pad',
            background: 'white',
            quality: 'auto:best',
          },
        },
        {
          name: 'zoom',
          label: 'Zoomable Image',
          transformations: {
            width: 2000,
            height: 2000,
            crop: 'pad',
            background: 'white',
            quality: 'auto:best',
            format: 'jpg',
          },
        },
      ],
    },
  },
})

// Example 4: Using presets in your frontend code
import { getTransformationUrl } from 'payload-storage-cloudinary'

// Generate a URL with a specific preset
const thumbnailUrl = getTransformationUrl({
  publicId: 'products/shoe-123',
  version: 1234567890,
  presetName: 'product-thumb',
  presets: customPresetConfig.collections.media.transformationPresets,
})

// Generate a URL with custom transformations
const customUrl = getTransformationUrl({
  publicId: 'products/shoe-123',
  version: 1234567890,
  customTransformations: {
    width: 500,
    height: 500,
    effect: 'art:hokusai',
  },
})
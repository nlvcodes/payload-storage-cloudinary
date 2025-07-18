// Example configuration for watermarked public previews of private files

import { cloudinaryStorage } from '../src/index'

// Example 1: Simple quality reduction and size limit
export const simplePreviewConfig = {
  cloudinaryStorage({
    cloudConfig: {
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
      api_key: process.env.CLOUDINARY_API_KEY!,
      api_secret: process.env.CLOUDINARY_API_SECRET!,
    },
    collections: {
      media: {
        privateFiles: true,
        transformations: {
          publicTransformation: {
            enabled: true,
            transformation: {
              quality: 30,
              width: 400,
              height: 400,
              crop: 'limit',
              effect: 'blur:100', // Add blur effect
            },
          },
        },
      },
    },
  })
}

// Example 2: Text overlay watermark (requires proper Cloudinary syntax)
export const textWatermarkConfig = {
  cloudinaryStorage({
    cloudConfig: {
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
      api_key: process.env.CLOUDINARY_API_KEY!,
      api_secret: process.env.CLOUDINARY_API_SECRET!,
    },
    collections: {
      media: {
        privateFiles: true,
        transformations: {
          publicTransformation: {
            enabled: true,
            transformation: [
              {
                width: 800,
                height: 800,
                crop: 'limit',
                quality: 60,
              },
              {
                overlay: {
                  font_family: 'Arial',
                  font_size: 60,
                  font_weight: 'bold',
                  text: 'PREVIEW',
                },
                color: 'rgb:ffffff80', // White with 50% opacity
                gravity: 'center',
                angle: -45,
              },
            ],
          },
        },
      },
    },
  })
}

// Example 3: Image overlay watermark
export const imageWatermarkConfig = {
  cloudinaryStorage({
    cloudConfig: {
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
      api_key: process.env.CLOUDINARY_API_KEY!,
      api_secret: process.env.CLOUDINARY_API_SECRET!,
    },
    collections: {
      media: {
        privateFiles: true,
        transformations: {
          publicTransformation: {
            enabled: true,
            transformation: {
              overlay: 'watermark', // You need to upload an image with public_id "watermark" first
              gravity: 'south_east',
              x: 10,
              y: 10,
              opacity: 50,
              width: 100,
              quality: 'auto',
              fetch_format: 'auto',
            },
          },
        },
      },
    },
  })
}

// Example 4: Pixelate effect for preview
export const pixelatePreviewConfig = {
  cloudinaryStorage({
    cloudConfig: {
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
      api_key: process.env.CLOUDINARY_API_KEY!,
      api_secret: process.env.CLOUDINARY_API_SECRET!,
    },
    collections: {
      media: {
        privateFiles: true,
        transformations: {
          publicTransformation: {
            enabled: true,
            transformation: {
              effect: 'pixelate:20',
              width: 600,
              height: 600,
              crop: 'limit',
              quality: 'auto',
            },
          },
        },
      },
    },
  })
}
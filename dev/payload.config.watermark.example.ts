// Example configurations for watermarked or blurred previews of private files.
// See docs/public-transformation-example.md.
//
// A private file uploads as an `authenticated` Cloudinary asset. A reader who passes
// customAuthCheck gets the original. Any other reader who may read the document gets only
// `previewUrl`: a signed URL with the watermark or blur, which breaks if edited.

import { cloudinaryStorage } from '../src/index'

const cloudConfig = {
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
}

// Example 1: Tiled text watermark. Logged-in users get the original, visitors the preview.
export const textWatermarkPlugin = cloudinaryStorage({
  cloudConfig,
  collections: {
    media: {
      privateFiles: {
        enabled: true,
        customAuthCheck: (req) => Boolean(req.user),
      },
      transformations: {
        preserveOriginal: true,
        publicTransformation: {
          enabled: true,
          watermark: {
            defaultText: 'PREVIEW',
            style: {
              fontFamily: 'Arial',
              fontSize: 60,
              fontWeight: 'bold',
              color: 'rgb:ffffff',
              opacity: 50,
              angle: -45,
            },
          },
        },
      },
    },
  },
})

// Example 2: Blurred preview. The editor picks "Blur" as the document's transformation type.
export const blurPreviewPlugin = cloudinaryStorage({
  cloudConfig,
  collections: {
    media: {
      privateFiles: {
        enabled: true,
        customAuthCheck: (req) => Boolean(req.user),
      },
      transformations: {
        preserveOriginal: true,
        publicTransformation: {
          enabled: true,
          blur: {
            effect: 'blur:1500',
            quality: 30,
            width: 400,
            height: 400,
          },
        },
      },
    },
  },
})

// Example 3: Image watermark. Upload the logo to Cloudinary first, as the public ID below.
// One corner logo can be cropped out of a download, so prefer Example 1 for content you sell.
export const imageWatermarkPlugin = cloudinaryStorage({
  cloudConfig,
  collections: {
    media: {
      privateFiles: {
        enabled: true,
        customAuthCheck: (req) => Boolean(req.user),
      },
      transformations: {
        preserveOriginal: true,
        publicTransformation: {
          enabled: true,
          watermark: {
            imageId: 'brand/watermark',
            style: { opacity: 50, position: 'south_east' },
          },
        },
      },
    },
  },
})

// Example 4: Presets under the watermark. The preview applies the selected presets, then the
// watermark. No customAuthCheck, so nobody gets the original through the plugin.
export const presetPreviewPlugin = cloudinaryStorage({
  cloudConfig,
  collections: {
    media: {
      privateFiles: true,
      transformations: {
        preserveOriginal: true,
        enablePresetSelection: true,
        presets: [
          {
            name: 'card',
            label: 'Card View',
            transformations: { width: 400, height: 400, crop: 'fill', gravity: 'auto' },
          },
        ],
        publicTransformation: {
          enabled: true,
          watermark: { defaultText: 'SAMPLE' },
        },
      },
    },
  },
})

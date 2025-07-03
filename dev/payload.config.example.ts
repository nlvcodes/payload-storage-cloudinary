import { buildConfig } from 'payload'
import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { slateEditor } from '@payloadcms/richtext-slate'
import path from 'path'
import { fileURLToPath } from 'url'

import { cloudinaryStorage } from 'payload-storage-cloudinary'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  editor: slateEditor({}),
  db: mongooseAdapter({
    url: process.env.DATABASE_URI || 'mongodb://localhost/cloudinary-test',
  }),
  collections: [
    {
      slug: 'media',
      upload: {
        disableLocalStorage: true,
      },
      fields: [
        {
          name: 'alt',
          type: 'text',
        },
      ],
    },
    {
      slug: 'products',
      fields: [
        {
          name: 'name',
          type: 'text',
          required: true,
        },
        {
          name: 'description',
          type: 'textarea',
        },
        {
          name: 'price',
          type: 'number',
          required: true,
        },
        {
          name: 'productImage',
          type: 'upload',
          relationTo: 'media',
          required: true,
        },
        {
          name: 'gallery',
          type: 'array',
          fields: [
            {
              name: 'image',
              type: 'upload',
              relationTo: 'media',
              required: true,
            },
          ],
        },
      ],
    },
  ],
  plugins: [
    cloudinaryStorage({
      cloudConfig: {
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
        api_key: process.env.CLOUDINARY_API_KEY!,
        api_secret: process.env.CLOUDINARY_API_SECRET!,
      },
      collections: {
        // Example 1: Simple configuration
        media: true,
        
        // Example 2: With static folder
        // media: {
        //   folder: 'website/uploads',
        // },
        
        // Example 3: With dynamic folders
        // media: {
        //   enableDynamicFolders: true,
        //   folder: 'uploads', // Default folder
        //   folderField: 'cloudinaryFolder', // Field name for folder selection
        // },
        
        // Example 4: With date-based folders
        // media: {
        //   folder: () => {
        //     const date = new Date()
        //     return `uploads/${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}`
        //   },
        // },
        
        // Example 5: With user-based folders
        // media: {
        //   folder: (data) => {
        //     // Assuming you pass user info in data
        //     return `users/${data.userId || 'anonymous'}/uploads`
        //   },
        // },
      },
    }),
  ],
  secret: process.env.PAYLOAD_SECRET || 'test-secret-key',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
})
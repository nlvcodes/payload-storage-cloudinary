import {buildConfig} from 'payload'
import {mongooseAdapter} from '@payloadcms/db-mongodb'
import {slateEditor} from '@payloadcms/richtext-slate'
import path from 'path'
import {fileURLToPath} from 'url'

import {cloudinaryStorage, commonPresets} from 'payload-storage-cloudinary'

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
            slug: 'documents',
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
    admin: {
        autoLogin: {
            email: 'nick@midlowebdesign.com',
            password: 'test',
        }
    },
    plugins: [
        cloudinaryStorage({
            cloudConfig: {
                cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
                api_key: process.env.CLOUDINARY_API_KEY!,
                api_secret: process.env.CLOUDINARY_API_SECRET!,
            },
            collections: {
                media: {
                    folder: {
                        // path: `media/${new Date().getFullYear()}`,
                        enableDynamic: true,
                        fieldName: 'cloudinaryFolder',
                        useFolderSelect: true, // Enable the new dropdown folder selection
                    },
                    deleteFromCloudinary: false,
                    transformations: {
                        default: {
                            quality: 'auto',
                            fetch_format: 'auto',
                        },
                        presets: commonPresets,
                        enablePresetSelection: true,
                        preserveOriginal: true,
                    },
                    uploadQueue: {
                        enabled: true,
                        maxConcurrentUploads: 3,
                        chunkSize: 20,
                        enableChunkedUploads: true,
                        largeFileThreshold: 400,
                    },
                    resourceType: 'auto',
                },
                documents: {
                    privateFiles: true, // Automatically enables signed URLs with 1 hour expiry
                },
            },
        }),
    ],
    secret: process.env.PAYLOAD_SECRET || 'test-secret-key',
    typescript: {
        outputFile: path.resolve(dirname, 'payload-types.ts'),
    },
})
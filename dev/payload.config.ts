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
            access: {
                read: () => true, // Allow read attempts, we'll check in afterRead
            },
            hooks: {
                afterRead: [
                    ({doc, req}) => {
                        // Check if this specific file requires authentication
                        if ((doc.requiresSignedURL || doc.isPrivate) && !req.user) {
                            return null
                        }
                        return doc
                    },
                ],
            },
            upload: {
                disableLocalStorage: true,
            },
            fields: [
                {
                    name: 'alt',
                    type: 'text',
                },
                // Override the auto-generated cloudinaryFolder field with our custom selector
                {
                    name: 'cloudinaryFolder',
                    type: 'text',
                    label: 'Cloudinary Folder',
                    admin: {
                        components: {
                            Field: '/src/components/field.tsx#selectField'
                        },
                        description: 'Select existing folder or create new one'
                    }
                }
            ],
        },
        {
            slug: 'watermarked-media',
            upload: {
                disableLocalStorage: true,
            },
            fields: [
                {
                    name: 'alt',
                    type: 'text',
                },
                {
                    name: 'caption',
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
        },
    },
    plugins: [
        // @ts-ignore
        cloudinaryStorage({
            cloudConfig: {
                cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
                api_key: process.env.CLOUDINARY_API_KEY!,
                api_secret: process.env.CLOUDINARY_API_SECRET!,
            },
            collections: {
                media: {
                    folder: {
                        path: 'uploads',
                        enableDynamic: true,
                        fieldName: 'cloudinaryFolder',
                        skipFieldCreation: true, // We're providing our own field
                    },
                    deleteFromCloudinary: true,
                    transformations: {
                        default: {
                            quality: 'auto',
                            fetch_format: 'auto',
                        },
                        presets: commonPresets,
                        enablePresetSelection: true,
                        preserveOriginal: true,
                        // Add public transformation for watermarked previews
                        publicTransformation: {
                            enabled: true,
                            fieldName: 'enablePublicPreview',
                            typeFieldName: 'transformationType',
                            watermark: {
                                textFieldName: 'watermarkText',
                                defaultText: 'PREVIEW',
                                style: {
                                    fontFamily: 'Verdana',
                                    fontSize: 50,
                                    fontWeight: 'bold',
                                    letterSpacing: 15,
                                    color: 'rgb:808080',
                                    opacity: 50,
                                    angle: -45,
                                    position: 'center',
                                },
                            },
                            blur: {
                                effect: 'blur:2000',
                                quality: 30,
                                width: 600,
                                height: 600,
                            },
                        },
                    },
                    uploadQueue: {
                        enabled: true,
                        maxConcurrentUploads: 3,
                        chunkSize: 20,
                        enableChunkedUploads: true,
                        largeFileThreshold: 400,
                    },
                    resourceType: 'auto',
                    privateFiles: {
                        enabled: true,
                        customAuthCheck: (req) => {
                            return !!req.user
                        }
                    }
                },
            }
        }),
    ],
    secret: process.env.PAYLOAD_SECRET || 'test-secret-key',
    typescript: {
        outputFile: path.resolve(dirname, 'payload-types.ts'),
    },
})
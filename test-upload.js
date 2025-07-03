import { v2 as cloudinary } from 'cloudinary'
import { createUploadHandler } from './dist/handlers/handleUpload.js'
import 'dotenv/config'

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

// Test upload
async function testUpload() {
  const options = {
    cloudConfig: {
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    },
    collections: {
      media: true,
    },
  }

  const handler = createUploadHandler(options)
  
  // Create a test file
  const testFile = {
    buffer: Buffer.from('test image data'),
    filename: 'test-image.jpg',
    filesize: 15,
    mimeType: 'image/jpeg',
  }
  
  const data = {}
  
  try {
    await handler({
      collection: { slug: 'media' },
      file: testFile,
      data,
      req: {},
      clientUploadContext: undefined,
    })
    
    console.log('✅ Upload successful!')
    console.log('📁 Data after upload:', data)
    
    // Check if file exists on Cloudinary
    if (data.cloudinaryPublicId) {
      const url = cloudinary.url(data.cloudinaryPublicId, { secure: true })
      console.log('🔗 Cloudinary URL:', url)
    }
  } catch (error) {
    console.error('❌ Upload failed:', error.message)
  }
}

testUpload()
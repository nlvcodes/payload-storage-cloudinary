import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '../../../../payload.config'
import { v2 as cloudinary } from 'cloudinary'

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
})

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  try {
    const payload = await getPayload({ config })
    
    // Get the image document
    const doc = await payload.findByID({
      collection: 'watermarked-media',
      id: id,
    }) as any
    
    if (!doc || !doc.cloudinaryPublicId) {
      return new NextResponse('Image not found', { status: 404 })
    }
    
    // Get size from query params
    const searchParams = request.nextUrl.searchParams
    const width = searchParams.get('w') || '800'
    const height = searchParams.get('h') || '600'
    
    // Build the watermarked URL server-side
    const watermarkedUrl = cloudinary.url(doc.cloudinaryPublicId, {
      secure: true,
      transformation: [
        { width, height, crop: 'fit' },
        {
          overlay: {
            font_family: 'Arial',
            font_size: 60,
            text: 'WATERMARKED - DO NOT COPY',
          },
          color: 'white',
          gravity: 'center',
        },
      ],
    })
    
    // Redirect to the watermarked URL
    return NextResponse.redirect(watermarkedUrl)
    
  } catch (error) {
    console.error('Error generating secure image URL:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
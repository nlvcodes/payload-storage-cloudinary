import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'

export async function GET(request: NextRequest) {
  const payload = await getPayload({ config })
  
  // Extract document ID from query params
  const url = new URL(request.url)
  const docId = url.searchParams.get('id') || '68781efaae4c2e339d35803f'
  
  try {
    // Test 1: Try to get document without req (server-side)
    const docWithoutReq = await payload.findByID({
      collection: 'documents',
      id: docId,
    })
    
    // Test 2: Try to get document with req
    const docWithReq = await payload.findByID({
      collection: 'documents',
      id: docId,
      req: request as any,
    })
    
    // Test 3: Check if document is marked as private
    const isPrivate = docWithReq?.isPrivate || false
    const requiresSignedURL = docWithReq?.requiresSignedURL || false
    
    // Test 4: Try to generate a signed URL server-side
    let signedUrl = null
    if (requiresSignedURL && docWithReq && docWithReq.cloudinaryPublicId) {
      const { generateSignedURL } = await import('payload-storage-cloudinary')
      signedUrl = generateSignedURL({
        publicId: docWithReq.cloudinaryPublicId,
        version: docWithReq.cloudinaryVersion || undefined,
        resourceType: docWithReq.cloudinaryResourceType || 'image',
        format: docWithReq.cloudinaryFormat || undefined,
        expiresIn: 3600,
      })
    }
    
    return NextResponse.json({
      success: true,
      tests: {
        docWithoutReq: !!docWithoutReq,
        docWithReq: !!docWithReq,
        documentId: docId,
        isPrivate,
        requiresSignedURL,
        hasCloudinaryPublicId: !!docWithReq?.cloudinaryPublicId,
        cloudinaryPublicId: docWithReq?.cloudinaryPublicId,
        signedUrl,
      },
      document: {
        id: docWithReq?.id,
        filename: docWithReq?.filename,
        url: docWithReq?.url,
        cloudinaryUrl: docWithReq?.cloudinaryUrl,
        isPrivate: docWithReq?.isPrivate,
        requiresSignedURL: docWithReq?.requiresSignedURL,
      }
    })
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      tests: {
        documentId: docId,
      }
    }, { status: 500 })
  }
}
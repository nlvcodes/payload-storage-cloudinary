import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const docId = '68781efaae4c2e339d35803f'
  
  try {
    // Test the actual signed URL endpoint
    const response = await fetch(`${request.nextUrl.origin}/api/documents/signed-url/${docId}`, {
      headers: {
        // Forward cookies from the original request
        cookie: request.headers.get('cookie') || '',
      },
    })
    
    const data = await response.json()
    
    return NextResponse.json({
      endpoint: `/api/documents/signed-url/${docId}`,
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      data,
      cookies: request.headers.get('cookie'),
    })
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
      endpoint: `/api/documents/signed-url/${docId}`,
    }, { status: 500 })
  }
}
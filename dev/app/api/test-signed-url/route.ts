import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const mediaId = searchParams.get('id')
  
  if (!mediaId) {
    return NextResponse.json({ error: 'Media ID required' }, { status: 400 })
  }

  try {
    // Get the host from the request
    const host = request.headers.get('host') || 'localhost:3001'
    const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http'
    
    // Call the signed URL endpoint
    const response = await fetch(`${protocol}://${host}/api/media/signed-url/${mediaId}`, {
      headers: {
        'Cookie': request.headers.get('cookie') || '',
      },
    })

    const responseText = await response.text()
    let data
    try {
      data = JSON.parse(responseText)
    } catch (e) {
      data = { rawResponse: responseText }
    }

    return NextResponse.json({
      success: response.ok,
      status: response.status,
      statusText: response.statusText,
      endpoint: `/api/media/signed-url/${mediaId}`,
      data,
    })
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}
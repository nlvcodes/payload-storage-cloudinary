# Private Images Authorization Guide

A comprehensive guide for implementing and using private images with authentication in Payload CMS with Cloudinary storage.

## Overview

This guide covers everything you need to know about working with private images, including:
- Per-file privacy control
- Authentication and authorization
- Public previews with watermarks/blur
- Frontend implementation patterns
- Common troubleshooting

## Key Concepts

### Per-File Privacy Control

Unlike collection-level privacy settings, the plugin supports per-file privacy control:

1. **Collection Configuration**: When you set `privateFiles: true` on a collection, it enables the privacy feature but doesn't force all files to be private
2. **User Control**: Each upload shows a "Private File" checkbox that users can check/uncheck
3. **Default Behavior**: The checkbox defaults to checked (private) but users can uncheck it to make files public
4. **Changing It Later**: Checking the box on an existing file moves its Cloudinary asset to `authenticated`, and unchecking it moves the asset to `upload`. The plugin renames the asset with `to_type` and invalidates the CDN copy, so the old URL stops working within a few minutes. If Cloudinary refuses the change, the save fails with an error and the file stays as it was. Unchecking the box moves the asset only after the save has written the document, so a save that fails for any other reason leaves the file private. See [Handling Updates](./handling-updates.md#4-privacy-changes).

### How Authentication Works

```
User → Frontend → Payload API → Access Control → Cloudinary Signed URL → Image
```

1. **User Authentication**: User must be logged into Payload (via cookie or JWT)
2. **API Request**: Frontend requests signed URL from Payload API
3. **Access Control**: Payload runs the collection's `read` access for the document, then the plugin runs `customAuthCheck`
4. **URL Generation**: If authorized, Payload builds a signed Cloudinary URL for the `authenticated` asset
5. **Image Delivery**: Frontend uses the signed URL to display the image

Every private file is stored on Cloudinary as an `authenticated` asset, previews included. Cloudinary refuses an unsigned URL for it with a 401.

> **Signed URLs don't expire.** Anyone who has a signed URL can open the file for as long as the asset exists at that version. Treat signed URLs as bearer links.

### Previews

For private files, you can show a preview with a watermark or blur to readers who may not get the original:
- **Watermarked Preview**: The original with a tiled text or image watermark
- **Blurred Preview**: The original, blurred and scaled down
- **Combined Preview**: The selected transformation presets, then the watermark or blur

The preview is `previewUrl`, a signed URL of the `authenticated` original. Editing it to remove the watermark or blur breaks the signature. A file uploaded before 1.3.0 gets an unsigned preview until it is [migrated](./public-transformation-example.md#files-uploaded-before-130). See [Previews for Private Files](./public-transformation-example.md).

## Configuration

### Basic Setup

```typescript
// In your Payload config
cloudinaryStorage({
  cloudConfig: {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  },
  collections: {
    media: {
      privateFiles: true, // Enable private files with default settings
    },
  },
})
```

### With Previews

```typescript
collections: {
  media: {
    privateFiles: {
      enabled: true,
      // Who gets the original. Without it, every reader gets only the preview.
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
            fontSize: 50,
            color: 'rgb:808080',
            opacity: 50,
            angle: -45,
          },
        },
        blur: {
          effect: 'blur:2000',
          quality: 30,
        },
      },
    },
  },
}
```

### With Custom Authentication

```typescript
collections: {
  documents: {
    privateFiles: {
      enabled: true,
      customAuthCheck: async (req, doc) => {
        // Only allow access to the owner
        if (doc.owner !== req.user?.id) {
          return false
        }
        return true
      },
    },
  },
}
```

### Advanced Configuration

```typescript
collections: {
  media: {
    privateFiles: {
      enabled: true,
      customAuthCheck: async (req, doc) => {
        // Allow access to owner or users with specific roles
        if (doc.owner === req.user?.id) {
          return true
        }
        
        if (req.user?.roles?.includes('admin')) {
          return true
        }
        
        return false
      },
    },
  },
}
```

## Required Collection Configuration

The signed URL endpoints run your collection's `read` access. Write it for who may read each file. Don't set `read: () => true` on a collection with private files unless every visitor may have them.

```typescript
{
  slug: 'media',
  access: {
    // Logged-in users read every file. Anonymous visitors read only public files.
    read: ({ req }) => (req.user ? true : { isPrivate: { equals: false } }),
  },
  upload: {
    disableLocalStorage: true,
  },
  // ... rest of config
}
```

This ensures that:
- Public files are readable by everyone
- An anonymous request for a private file gets a 404 from the signed URL endpoint and no URL
- `customAuthCheck`, if you set one, runs only for callers who passed `read`

With no `read` access, Payload's default allows any logged-in user and refuses anonymous callers with a 403.

## Frontend Implementation

### Important: Client-Side Imports

Always import from `'payload-storage-cloudinary/client'` for client-side usage:

```typescript
// ✅ Correct - client-side import
import { fetchSignedURL, useSignedURL } from 'payload-storage-cloudinary/client'

// ❌ Wrong - includes server dependencies
import { fetchSignedURL } from 'payload-storage-cloudinary'
```

### 1. Simple Image Display

```tsx
import { getImageURL } from 'payload-storage-cloudinary/client'

function SmartImage({ doc, collection = 'media' }) {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // This helper handles both public and private files
    getImageURL(doc, collection)
      .then(setUrl)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [doc, collection])

  if (loading) return <div>Loading...</div>
  if (!url) return <div>Image not available</div>

  return <img src={url} alt={doc.alt} />
}
```

### 2. React Component with Loading State

```tsx
import React, { useState, useEffect } from 'react'
import { fetchSignedURL, requiresSignedURL } from 'payload-storage-cloudinary/client'

function PrivateImageComponent({ doc, collection = 'media' }) {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    async function loadImage() {
      // Check if this image needs a signed URL
      if (!requiresSignedURL(doc)) {
        // Use the best available URL for public files
        setImageUrl(doc.transformedUrl || doc.url)
        return
      }

      setLoading(true)
      try {
        const url = await fetchSignedURL(collection, doc.id)
        setImageUrl(url)
      } catch (err) {
        setError(err as Error)
      } finally {
        setLoading(false)
      }
    }

    loadImage()
  }, [doc, collection])

  if (loading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>
  if (!imageUrl) return null

  return <img src={imageUrl} alt={doc.alt} />
}
```

### 3. Using the Built-in Hook

The hook refetches the URL on a timer so a reader who loses access stops getting new links. The interval is 3600 seconds minus `refetchBuffer` (default 300), with a floor of 60 seconds, so by default it refetches about every 55 minutes. Signed URLs don't expire, so `refetchBuffer` only shortens the interval. It is not an expiry margin.

```tsx
import React from 'react'
import { useSignedURL } from 'payload-storage-cloudinary/client'

function PrivateImageWithHook({ doc }) {
  const { url, loading, error } = useSignedURL('media', doc?.id, {
    react: React, // Required for Next.js
    // Seconds taken off the 3600-second refetch interval (default 300, so about every 55 minutes).
    // Raise it to refetch more often. Signed URLs don't expire, so this is not an expiry margin.
    refetchBuffer: 300,
  })

  if (loading) return <div className="skeleton-loader" />
  if (error) return <div className="error">Failed to load image</div>
  if (!url) return null

  return (
    <img 
      src={url} 
      alt={doc.alt}
      className="w-full h-auto"
      loading="lazy"
    />
  )
}
```

### 4. Using the Pre-built Component

```tsx
import React from 'react'
import { createPrivateImageComponent } from 'payload-storage-cloudinary/client'

// Create the component once
const PrivateImage = createPrivateImageComponent(React)

function MyComponent({ doc }) {
  return (
    <PrivateImage 
      doc={doc} 
      collection="media" 
      alt="My private image"
      className="w-full h-auto"
      fallback={<div>Loading...</div>}
    />
  )
}
```

For a private file, the component shows the document's `previewUrl` until the reader asks for the full image. It never shows the thumbnail, which isn't watermarked. A private file with no `previewUrl` shows nothing until the reader asks.

## Working with Previews

A reader who may only see the preview gets `previewUrl`, and `null` in `url`, `thumbnailURL` and `transformedUrl`. `previewUrl` carries the selected presets, then the watermark or blur.

```tsx
function ImageWithPreview({ doc }) {
  if (doc.transformedUrl || doc.url) {
    // A public file, or a reader who may get the original
    return <img src={doc.transformedUrl || doc.url} alt={doc.alt} />
  }

  // A reader who may only see the preview
  if (doc.previewUrl) {
    return (
      <div>
        <img src={doc.previewUrl} alt={`${doc.alt} (preview)`} />
        <p>This is a preview. <a href="/login">Log in</a> to see full quality.</p>
      </div>
    )
  }

  // No preview, so require authentication
  return <div>This image requires authentication</div>
}
```

### Gallery with Mixed Public/Private Images

```tsx
import { fetchSignedURLs, requiresSignedURL } from 'payload-storage-cloudinary/client'

function PrivateGallery({ images }) {
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadImages() {
      // Separate private and public images
      const privateImages = images.filter(img => requiresSignedURL(img))
      const publicImages = images.filter(img => !requiresSignedURL(img))

      // Create initial URL map with public images
      const urlMap: Record<string, string> = {}
      publicImages.forEach(img => {
        // Use the best available URL for public images
        urlMap[img.id] = img.transformedUrl || img.url
      })

      // Fetch signed URLs for private images
      if (privateImages.length > 0) {
        const privateIds = privateImages.map(img => img.id)
        const signedUrls = await fetchSignedURLs('media', privateIds)
        Object.assign(urlMap, signedUrls)
      }

      setImageUrls(urlMap)
      setLoading(false)
    }

    loadImages()
  }, [images])

  if (loading) return <div>Loading gallery...</div>

  return (
    <div className="grid grid-cols-3 gap-4">
      {images.map(image => (
        <div key={image.id} className="relative">
          <img 
            src={imageUrls[image.id] || image.previewUrl || '/placeholder.jpg'}
            alt={image.alt}
            className="w-full h-auto"
          />
          {image.isPrivate && !imageUrls[image.id] && (
            <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
              <span className="text-white">Private Image</span>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
```

## Authentication Strategies

### 1. Cookie-based Authentication (Default)

```typescript
// Frontend automatically includes cookies
const url = await fetchSignedURL('media', docId)
```

### 2. JWT Token Authentication

```typescript
// Get token from your auth system
const token = localStorage.getItem('jwt-token')

const url = await fetchSignedURL('media', docId, {
  token: token,
})
```

### 3. Server-Side Rendering (SSR)

In a server component, use the server helpers with a request for the visitor. They enforce your collection's `read` access and the access rule, and return `null` when the visitor may not have the file:

```tsx
import { headers } from 'next/headers'
import { createLocalReq, getPayload } from 'payload'
import config from '@payload-config'
import { getPrivateImageURL } from 'payload-storage-cloudinary'

async function getPrivateImageUrl(doc) {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })
  const req = await createLocalReq({ user }, payload)

  return getPrivateImageURL(doc, { payload, collection: 'media', req })
}
```

Called with no `req` and no `user`, a helper treats the caller as anonymous. Only a trusted server job with no reader, such as a sitemap, passes `overrideAccess: true`. See [Server Helpers](./signed-urls.md#server-helpers).

## Complete Working Example

Here's a full example that works with Next.js App Router:

```tsx
'use client'

import React, { useEffect, useState } from 'react'
import { 
  fetchSignedURL, 
  useSignedURL, 
  requiresSignedURL,
  createPrivateImageComponent,
  getImageURL 
} from 'payload-storage-cloudinary/client'

// Create the component once
const PrivateImage = createPrivateImageComponent(React)

// Example 1: Smart component that handles both public and private
function SmartImageExample({ doc }: { doc: any }) {
  const [url, setUrl] = useState<string>('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getImageURL(doc, 'media')
      .then(setUrl)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [doc])

  if (loading) return <div>Loading...</div>
  return <img src={url} alt={doc.alt} />
}

// Example 2: Using the hook for private files
function HookExample({ doc }: { doc: any }) {
  const { url, loading, error } = useSignedURL('media', doc?.id, {
    react: React
  })

  if (loading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>
  return <img src={url!} alt={doc.alt} />
}

// Example 3: Using the pre-built component
function ComponentExample({ doc }: { doc: any }) {
  return (
    <PrivateImage 
      doc={doc} 
      collection="media" 
      alt="My image"
      className="w-full h-auto"
      fallback={<div>Loading...</div>}
    />
  )
}

// Example 4: With preview support
function PreviewExample({ doc }: { doc: any }) {
  if (!doc.isPrivate) {
    return <img src={doc.transformedUrl || doc.url} alt={doc.alt} />
  }

  // Show the preview if available
  if (doc.previewUrl) {
    return (
      <div>
        <img src={doc.previewUrl} alt={`${doc.alt} - Preview`} />
        <p>This is a preview with transformations and watermark</p>
      </div>
    )
  }

  // Use the hook for authenticated access
  return <HookExample doc={doc} />
}
```

## Troubleshooting

### Issue: "Private File" checkbox behavior

**How it works**: 
- When `privateFiles` is enabled, each upload gets a checkbox
- Checked = Private (requires authentication)
- Unchecked = Public (accessible to everyone)
- The plugin respects this per-file setting throughout the system
- Changing the checkbox on a saved file moves the asset between `authenticated` and `upload` on Cloudinary. If the save fails with "Cloudinary could not change the privacy of this file", nothing changed: try again, and check the Cloudinary credentials and the asset in the Media Library
- A file still delivered as `authenticated` after you unchecked the box was saved as a draft, or its save failed. Publish the change, or save the file again

### Expected HTTP Status Codes

When testing private file access:

**Authenticated users:**
- Direct media access (`/api/media/{id}`): 200 OK
- Signed URL endpoint (`/api/media/signed-url/{id}`): 200 OK with URL

**Callers the collection's `read` access refuses:**
- Direct media access: 403 Forbidden, or 404 Not Found when `read` returns a query
- Signed URL endpoint: the same status, and no URL

**Callers who can read the document but fail `customAuthCheck`:**
- Signed URL endpoint: 403 Forbidden

### Issue: Getting 403 Forbidden

**Possible causes:**
1. User is not authenticated
2. The collection's `read` access refuses the user
3. `customAuthCheck` returned `false`
4. The collection has `publicTransformation` and no `customAuthCheck`, so nobody gets the original
5. JWT token has expired
6. CORS issues with credentials

**Debug steps:**
```typescript
// Check authentication
const response = await fetch('/api/media/signed-url/123', {
  credentials: 'include', // Essential for cookies
})
console.log(response.status, await response.text())
```

### Issue: URL returns 404

**Possible causes:**
1. Document doesn't exist
2. The collection's `read` access returns a query that excludes the document
3. Collection name is wrong
4. API endpoint path is incorrect

**Debug:**
```typescript
// Verify the endpoint
console.log(`/api/${collection}/signed-url/${docId}`)
```

### Issue: A signed URL returns 404

**Solution**: The URL's delivery type doesn't match the asset. A private file uploaded before 1.3.0 with `publicTransformation` enabled is an `upload` asset, not an `authenticated` one. Migrate it to `authenticated`.

### Issue: `expiresIn` or `authToken` logs a deprecation warning

**Solution**: Remove the setting. Neither ever made a URL expire, and both are now ignored.

## Best Practices

1. **Use the right helper**: Use `getImageURL()` for mixed collections, `fetchSignedURL()` for known private files
2. **Handle loading states**: Always show loading states for better UX
3. **Implement error boundaries**: Wrap image components in error boundaries
4. **Cache management**: A signed URL stays valid, so cache it, and fetch a new one when the reader's access may have changed
5. **Progressive enhancement**: Show public previews while loading full images
6. **Batch loading**: Use batch endpoints for galleries

## Security Considerations

1. **Never expose Cloudinary credentials** in frontend code
2. **Always validate permissions** on the server
3. **Treat signed URLs as bearer links**: they don't expire, so hand them only to readers allowed to see the file
4. **Monitor usage** for unusual access patterns
5. **Implement rate limiting** on signed URL endpoints
6. **Use HTTPS** for all requests

## Performance Tips

1. **Preload critical images**:
   ```typescript
   const link = document.createElement('link')
   link.rel = 'preload'
   link.as = 'image'
   link.href = await getImageURL(doc, 'media')
   document.head.appendChild(link)
   ```

2. **Use intersection observer** for lazy loading:
   ```typescript
   const observer = new IntersectionObserver((entries) => {
     entries.forEach(entry => {
       if (entry.isIntersecting) {
         loadPrivateImage(entry.target)
       }
     })
   })
   ```

3. **Implement retry logic** for failed requests
4. **Use service workers** for offline support (with careful cache management)
5. **Show public previews** while loading authenticated versions
# Signed URLs for Private Content

Secure your Cloudinary assets with time-limited, signed URLs for controlled access to private content.

## Overview

Signed URLs provide secure, time-limited access to private files stored in Cloudinary. This feature is essential for:
- Protected documents
- Paid content
- User-specific media
- Temporary access links
- Download tracking

## Configuration

### Basic Configuration

```typescript
cloudinaryStorage({
  collections: {
    documents: {
      privateFiles: true, // Enables signed URLs with 1-hour expiry
    },
  },
})
```

### Advanced Configuration

```typescript
cloudinaryStorage({
  collections: {
    documents: {
      privateFiles: {
        enabled: true,
        expiresIn: 7200, // 2 hours
        authTypes: ['authenticated'],
        includeTransformations: true,
        customAuthCheck: async (req, doc) => {
          // Custom access control logic
          return req.user && doc.allowedUsers.includes(req.user.id)
        },
      },
    },
  },
})
```

## Configuration Options

When using `privateFiles: true` (shorthand), it automatically enables signed URLs with 1-hour expiry.

For full configuration, use an object:

- **enabled** (boolean): Enable signed URL generation
- **expiresIn** (number): URL expiration time in seconds (default: 3600)
- **authTypes** (array): Cloudinary auth types to use
- **includeTransformations** (boolean): Allow transformations in signed URLs
- **customAuthCheck** (function): Custom access control logic

## How It Works

1. **Upload**: Files marked as private are uploaded with restricted access
2. **Storage**: Cloudinary stores files with authentication requirements
3. **Access**: Users request signed URLs through API endpoints
4. **Validation**: System checks user permissions
5. **Generation**: Time-limited signed URLs are created
6. **Delivery**: Secure URLs provided for temporary access

## API Endpoints

### Get Single Signed URL

```bash
GET /api/{collection}/signed-url/{documentId}
```

Response:
```json
{
  "url": "https://res.cloudinary.com/...",
  "expiresIn": 3600,
  "expiresAt": "2024-07-02T15:30:00Z"
}
```

### Get Batch Signed URLs

```bash
POST /api/{collection}/signed-urls
Content-Type: application/json

{
  "ids": ["id1", "id2", "id3"]
}
```

Response:
```json
{
  "results": [
    {
      "id": "id1",
      "url": "https://res.cloudinary.com/...",
      "expiresIn": 3600
    },
    ...
  ]
}
```

### Download with Signed URL

```bash
GET /api/{collection}/signed-url/{documentId}?download=true
```

## Frontend Usage

### React Component for Protected Images

```tsx
function ProtectedImage({ docId }) {
  const [url, setUrl] = useState(null)
  
  useEffect(() => {
    fetch(`/api/media/signed-url/${docId}`)
      .then(res => res.json())
      .then(data => setUrl(data.url))
  }, [docId])
  
  return url ? <img src={url} /> : <div>Loading...</div>
}
```

### Gallery with Batch URLs

```typescript
async function loadGallery(imageIds) {
  const response = await fetch('/api/media/signed-urls', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: imageIds })
  })
  
  const { results } = await response.json()
  return results
}
```

## Access Control

### Default Access Control

By default, signed URLs are only generated for authenticated users who have access to the document.

### Custom Access Control

Implement custom logic for fine-grained control:

```typescript
customAuthCheck: async (req, doc) => {
  // Check user subscription
  if (doc.requiresSubscription && !req.user.isSubscribed) {
    return false
  }
  
  // Check content rating
  if (doc.rating === 'adult' && req.user.age < 18) {
    return false
  }
  
  // Check geographic restrictions
  if (doc.allowedCountries && !doc.allowedCountries.includes(req.user.country)) {
    return false
  }
  
  return true
}
```

## Security Features

1. **Time Expiration**: URLs automatically expire after specified duration
2. **IP Restrictions**: Optional IP-based access control
3. **Authentication Tokens**: Cryptographically signed tokens
4. **One-Time URLs**: Option to invalidate after first use
5. **Transformation Protection**: Prevent unauthorized image manipulations

## Use Cases

### 1. Paid Content Delivery

```typescript
collections: {
  premiumContent: {
    privateFiles: {
      enabled: true,
      expiresIn: 86400, // 24 hours
      customAuthCheck: async (req, doc) => {
        return req.user?.subscription?.active
      }
    }
  }
}
```

### 2. Temporary Share Links

```typescript
// Generate temporary share link
const shareUrl = await generateSignedURL({
  publicId: doc.cloudinaryPublicId,
  expiresIn: 3600 * 24 * 7, // 1 week
})
```

### 3. Watermarked Previews

```typescript
// Public preview with watermark
const previewUrl = generateSignedURL({
  publicId: doc.cloudinaryPublicId,
  transformations: {
    overlay: 'watermark',
    gravity: 'center',
    opacity: 50
  }
})
```

## Best Practices

1. **Short Expiration**: Use the shortest practical expiration time
2. **Cache Headers**: Configure appropriate cache headers
3. **Preload URLs**: Generate URLs before they're needed
4. **Error Handling**: Handle expired URLs gracefully
5. **Monitoring**: Track URL generation and usage

## Troubleshooting

### Common Issues

1. **403 Forbidden**: Check authentication and permissions
2. **URL Expired**: Regenerate the signed URL
3. **Invalid Signature**: Verify API credentials
4. **Transformation Blocked**: Enable `includeTransformations`

### Debug Mode

Enable debug logging:
```typescript
privateFiles: {
  enabled: true,
  debug: true, // Logs URL generation details
}
```

## Performance Considerations

- Signed URL generation adds minimal overhead
- URLs can be cached until expiration
- Batch endpoints reduce API calls
- Consider CDN integration for global delivery

## Migration Guide

Converting existing public files to private:

1. Update collection configuration
2. Run migration script to update existing files
3. Update frontend to use signed URLs
4. Test access control thoroughly
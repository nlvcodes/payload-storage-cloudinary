# Signed URLs for Private Content

Deliver private Cloudinary assets through signed URLs, so nothing reaches a private file without a signature.

## Overview

A private file is stored on Cloudinary as an `authenticated` asset. Cloudinary serves an `authenticated` asset only through a signed URL, and the signature covers the transformation and the public ID, so editing the URL breaks it. This feature is for:
- Protected documents
- Paid content
- User-specific media

> **Signed URLs don't expire.** A Cloudinary signed URL keeps working for as long as the asset exists at that version. Treat every signed URL as a bearer link: anyone who has it can open the file. Hand it only to readers allowed to see the file, and don't store it where others can read it. To cut off an old link, change the asset (re-upload it, or rename it).

## Configuration

### Basic Configuration

```typescript
cloudinaryStorage({
  collections: {
    documents: {
      privateFiles: true, // Stores private files as authenticated and enables signed URLs
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
        authTypes: ['authenticated'],
        includeTransformations: true,
        customAuthCheck: async (req, doc) => {
          // Decides who gets the original file, after the collection's read access passes
          return req.user && doc.allowedUsers.includes(req.user.id)
        },
      },
    },
  },
})
```

## Configuration Options

`privateFiles: true` (shorthand) enables signed URLs with the default settings.

For full configuration, use an object:

- **enabled** (boolean): Enable signed URL generation
- **authTypes** (array): Cloudinary auth types to use
- **includeTransformations** (boolean): Allow transformations in signed URLs
- **customAuthCheck** (function): Decides who gets the original file. It runs after the collection's `read` access has passed. On a `publicTransformation` collection, nobody gets the original unless this check passes.
- **expiresIn**, **authToken**: Deprecated and ignored. They never made a URL expire. The plugin logs one warning at startup if either is set. Remove them from your config.

## How It Works

1. **Upload**: Files can be marked as private on a per-file basis using the checkbox
2. **Storage**: A private file uploads to Cloudinary as an `authenticated` asset, with or without `publicTransformation`. The plugin records the asset's delivery type in the `cloudinaryType` field
3. **Access**: Users request signed URLs through API endpoints
4. **Validation**: The endpoint looks up the document with the collection's `read` access enforced, then runs `customAuthCheck`. See [Access Control](#access-control)
5. **URL Return**: The plugin builds a signed `authenticated` URL. It includes the asset version and carries no auth token
6. **Delivery**: Browser uses the signed URL to display the image

## Important Notes

1. **Per-file Privacy Control**: When `privateFiles` is enabled on a collection, users can check/uncheck the "Private File" checkbox for individual files. This provides granular control over which files require authentication.

2. **Client-side Imports**: Always use `'payload-storage-cloudinary/client'` for browser code to avoid server dependencies:
   ```typescript
   // ✅ Correct - client-side import
   import { fetchSignedURL, useSignedURL } from 'payload-storage-cloudinary/client'
   
   // ❌ Wrong - includes server dependencies
   import { fetchSignedURL } from 'payload-storage-cloudinary'
   ```

3. **Authentication Methods**: The plugin supports both cookie-based and JWT token authentication for flexible integration.

## API Endpoints

### Get Single Signed URL

```bash
GET /api/{collection}/signed-url/{documentId}
```

Response:
```json
{
  "url": "https://res.cloudinary.com/{cloud}/image/authenticated/s--{signature}--/v{version}/{publicId}.{format}"
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

A request takes at most 100 IDs. A longer list returns **400** before the endpoint queries the database, so split a larger gallery into several requests.

Response: one result per requested ID, in the order requested. An ID the caller may not have gets a `status` and no URL.
```json
{
  "results": [
    { "id": "id1", "url": "https://res.cloudinary.com/..." },
    { "id": "id2", "status": 403, "error": "Access denied" },
    { "id": "id3", "status": 404, "error": "Document not found" }
  ]
}
```

### Download with Signed URL

```bash
GET /api/{collection}/signed-url/{documentId}?download=true
```

The response adds `downloadUrl`, a signed URL that delivers the file as an attachment.

The responses carry no `expiresIn` or `expiresAt`. Earlier versions returned them, but the URL never expired.

### Transformations

Both endpoints can sign a resized or re-encoded version of the original. The single endpoint takes a `transformations` query parameter, and the batch endpoint takes a `transformations` object in the body, applied to every ID:

```bash
# JSON
GET /api/{collection}/signed-url/{documentId}?transformations={"width":300,"crop":"fill"}

# Comma-separated key:value pairs
GET /api/{collection}/signed-url/{documentId}?transformations=width:300,crop:fill

# Bracketed keys
GET /api/{collection}/signed-url/{documentId}?transformations[width]=300&transformations[crop]=fill
```

```json
POST /api/{collection}/signed-urls
{ "ids": ["id1", "id2"], "transformations": { "width": 300, "crop": "fill" } }
```

The endpoints accept only these keys, all of which change how the document's own file is sized, cropped or encoded:

| Key | Example |
|-----|---------|
| `width` | `300` |
| `height` | `200` |
| `crop` | `fill`, `fit`, `limit`, `scale`, `thumb`, `pad` |
| `gravity` | `auto`, `face`, `center`, `north_east` |
| `quality` | `auto`, `80` |
| `fetch_format` | `auto`, `webp`, `avif` |
| `dpr` | `2`, `auto` |
| `aspect_ratio` | `1.5` |

Each value must be a number, or a string of at most 32 letters, digits, `_` and `.`. A value with `/`, `,`, `:`, `$` or a space is refused. That rules out qualified values such as `quality: "auto:good"`, `gravity: "auto:faces"` and `aspect_ratio: "16:9"`. Write the ratio as a decimal (`1.78`).

A request with any other key, such as `overlay`, `underlay`, `raw_transformation`, `transformation` (a named transformation), `effect` or `default_image`, or with a value that breaks the rule, returns **400** with an `error` message, and the endpoint signs nothing. These keys can name another asset in the signed URL, or add components the signature would then cover. For anything beyond the allowlist, configure the transformation on the collection (`transformations.default` or a preset) instead of sending it from the client.

## Frontend Usage

The plugin now provides built-in helper functions for easier frontend integration:

### Using the Built-in Helpers

```typescript
import { fetchSignedURL, useSignedURL, createPrivateImageComponent, requiresSignedURL, getImageURL } from 'payload-storage-cloudinary/client'

// 1. Simple fetch for a signed URL
const url = await fetchSignedURL('media', docId)

// 2. Check if a document needs a signed URL
if (requiresSignedURL(doc)) {
  const url = await fetchSignedURL('media', doc.id)
}

// 3. Get the appropriate URL (signed or regular)
const imageUrl = await getImageURL(doc, 'media')
```

### React Hook with Periodic Refetch

The hook fetches the URL from the signed-URL endpoint, then fetches it again on a timer. The point of the refetch is access, not expiry: a reader who loses access to the file stops getting new links. The interval is 3600 seconds minus `refetchBuffer` (default 300), with a floor of 60 seconds, so by default the hook refetches about every 55 minutes. A larger `refetchBuffer` means more frequent refetches. It is not tied to any URL expiry, because signed URLs don't expire.

```tsx
import React from 'react'
import { useSignedURL } from 'payload-storage-cloudinary/client'

function ProtectedImage({ doc }) {
  const { url, loading, error } = useSignedURL('media', doc?.id, {
    react: React, // Required for Next.js
    // Seconds taken off the 3600-second refetch interval (default 300, so about every 55 minutes).
    // Raise it to refetch more often. Signed URLs don't expire, so this is not an expiry margin.
    refetchBuffer: 300,
  })
  
  if (loading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>
  if (!url) return null
  
  return <img src={url} alt={doc.alt} />
}
```

### Pre-built React Component

```tsx
import React from 'react'
import { createPrivateImageComponent } from 'payload-storage-cloudinary/client'

// Create the component once
const PrivateImage = createPrivateImageComponent(React)

// Simple usage
<PrivateImage 
  doc={mediaDoc} 
  collection="media" 
  alt="Protected content"
  className="w-full h-auto"
  fallback={<div>Loading...</div>}
/>
```

### Gallery with Batch URLs

```typescript
import { fetchSignedURLs } from 'payload-storage-cloudinary/client'

// Using the built-in helper
async function loadGallery(imageIds) {
  const urls = await fetchSignedURLs('media', imageIds)
  return urls // Returns { docId: url } mapping
}

// Or manually if you need more control
async function loadGalleryManual(imageIds) {
  const response = await fetch('/api/media/signed-urls', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include', // Important for authentication
    body: JSON.stringify({ ids: imageIds })
  })
  
  // One result per ID: a `url`, or a `status` the caller may not have
  const { results } = await response.json()
  return results
}
```

### Authentication Options

```typescript
// With JWT token
const url = await fetchSignedURL('media', docId, {
  token: 'your-jwt-token'
})

// With custom headers
const url = await fetchSignedURL('media', docId, {
  headers: {
    'X-Custom-Auth': 'value'
  }
})

// With different base URL (for server-side rendering)
const url = await fetchSignedURL('media', docId, {
  baseUrl: 'http://localhost:3000'
})
```

## Access Control

Both endpoints apply the same rule:

1. The endpoint looks up the document with your collection's `read` access enforced. If `read` returns `false`, the endpoint answers **403**. If `read` returns a query that excludes the document, or the document does not exist, it answers **404**. Neither answer includes a URL.
2. If the collection has a `customAuthCheck`, it must pass. If it fails, the endpoint answers **403**.
3. On a collection with `publicTransformation` enabled and no `customAuthCheck`, nobody gets the original, so the endpoint answers **403** to every caller. Readers get the watermarked or blurred preview from the document instead.

Caller-supplied `transformations` apply only to a caller who passed all three steps, and only the keys listed under [Transformations](#transformations). The batch endpoint applies the rule to each ID on its own.

Your collection's `read` access is the main gate, so write it for who may read each file:

```typescript
{
  slug: 'media',
  upload: true,
  access: {
    // Each user reads only their own files
    read: ({ req }) => (req.user ? { owner: { equals: req.user.id } } : false),
  },
  fields: [{ name: 'owner', type: 'relationship', relationTo: 'users' }],
}
```

With no `read` access, Payload's default allows any logged-in user and refuses anonymous callers.

### Custom Access Control

Use `customAuthCheck` for rules that go beyond `read`. It receives the request and the document, and runs only for callers who passed `read`:

```typescript
customAuthCheck: async (req, doc) => {
  // Anonymous readers never get the original
  if (!req.user) {
    return false
  }

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

The check decides on the whole document as stored, wherever it runs: a read (REST, GraphQL or the Local API), either signed-URL endpoint, or a server helper. It gets every field, whatever the lookup selected, populated or hid with field access, so a reader can't leave out the field your check reads with `select` or `populate`, and a field the reader has no field `read` access to is still there for the check. The plugin reads that document through the database adapter, with the reader's request, and gives it to your check as a read with every field visible would return it at `depth: 0`: relationship fields hold IDs, not populated documents, and your field `afterRead` hooks have run. No collection hook runs again. The document is the same shape in every one of these places.

On a collection with localized fields, the check sees each localized field as a single value, the value a read in one locale shows, with your configured fallback locale applied. Write the check the way you read the field anywhere else, such as `doc.locked !== true`.

The file is the same in every locale, so the check runs once per configured locale, each time on the document in that locale, whatever locale the reader asked for with `?locale=` (`locale=all` included). The reader gets the original only when every run allows it, and gets the preview instead of nothing only when every locale allows at least that. A file that one locale locks is locked in every locale, so a reader can't pick a locale that doesn't lock it. The reader's `fallback-locale` doesn't change the decision.

Deciding this way has a cost, and a rule for your field hooks:

- Each document of a `privateFiles` collection that a read, a signed-URL endpoint, a server helper or `isAccessAllowedByID` decides on costs one more database read, for its stored row. A list read reads each document's row on its own, the batch endpoint reads all its IDs in one query, and a version read by ID reads two rows, the version and its document.
- The plugin runs your field `afterRead` hooks on that row once per configured locale, or once on a site without localization, and runs `customAuthCheck` once per locale.
- Those field hooks run again during the decision, after the reader's own read ran them, with `overrideAccess: true` and `showHiddenFields: true`, and for readers who may get nothing. So a field `afterRead` hook must have no side effects: don't write to the database, send a message, count a view or log an audit entry from one. A hook that throws during the decision makes the plugin fail closed, as below.

On a read, every URL in the response is built from that same stored document:

- A read with `draft=true` decides on the stored document, not the draft, and builds the URLs from its file.
- A version read by ID builds the URLs from that stored version. The check runs on the stored version and on the stored document it belongs to, and the reader gets a URL only when both allow it. Every version shares the document's file, so an old version, or a draft that was never published, can't unlock what the current document refuses. Both carry the document's `id`.
- A versions list can't tell the plugin which stored version each entry is, so on a collection with `customAuthCheck` it returns no URL for a private file, even to a reader the check allows. Read the version by ID instead.
- When the plugin can't read the stored document or put it in each locale, for example because a field hook throws, every URL field is `null`, and the signed-URL endpoints answer **403**. Every URL field is also `null` when a read excludes the asset fields.

## Server Helpers

`getSignedURL`, `getSignedURLs`, `getServerImageURL`, `getPrivateImageURL` and `getPremiumImageURL` (import them from `payload-storage-cloudinary`) apply the same rule as the endpoints. Each one looks the document up with your collection's `read` access enforced, then checks `customAuthCheck` and `publicTransformation`. The helpers read that config from the installed plugin, so you don't pass it.

Access resolves against `req` when you pass it, else `user`, else an anonymous caller. A helper called with none of them treats the caller as anonymous, so on a restricted document it returns `null`. Pass `req` whenever you have one.

In a custom endpoint or a hook, pass the request you already have:

```typescript
import { getSignedURL } from 'payload-storage-cloudinary'

const url = await getSignedURL({
  payload: req.payload,
  collection: 'media',
  docId: id,
  req,
})
// null when this reader may not have the original
```

In a Next.js server component, authenticate the visitor and build a request for them:

```tsx
import { headers } from 'next/headers'
import { createLocalReq, getPayload } from 'payload'
import config from '@payload-config'
import { getPrivateImageURL } from 'payload-storage-cloudinary'

export async function PrivatePhoto({ doc }) {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })
  const req = await createLocalReq({ user }, payload)

  const url = await getPrivateImageURL(doc, { payload, collection: 'media', req })
  return url ? <img src={url} alt={doc.alt} /> : <p>Log in to see this file.</p>
}
```

`getPremiumImageURL` returns the original to a reader the rule allows, the watermarked or blurred `previewUrl` from the reader's own read to a preview-only reader, and `null` to anyone else. No helper falls back to a stored URL or to the thumbnail.

### Trusted server jobs

A job with no reader, such as a sitemap or an email render, can skip access with an explicit opt-in:

```typescript
const url = await getSignedURL({
  payload,
  collection: 'media',
  docId: id,
  overrideAccess: true, // skips `read`, customAuthCheck and publicTransformation
})
```

The URL it returns doesn't expire. Only send it to someone who may have the file.

### Transformations in the server helpers

`getSignedURL`, `getSignedURLs` and `getServerImageURL` take a `transformations` option, and check it against the same allowlist as the endpoints (see [Transformations](#transformations)): `width`, `height`, `crop`, `gravity`, `quality`, `fetch_format`, `dpr` and `aspect_ratio`, each a number or a short token of letters, digits, `_` and `.`. The check runs before the lookup. A transformation outside it throws an `APIError` with status 400, and the helper signs nothing. The error names the rule, never the file or a URL. `getSignedURLs` throws for the whole batch. `getServerImageURL` checks a public file's transformations too.

```typescript
// Safe with values from the request: anything outside the allowlist throws
const url = await getSignedURL({
  payload: req.payload,
  collection: 'media',
  docId: id,
  req,
  transformations: { width: Number(req.query.width), crop: 'fill' },
})
```

Server code that builds a transformation beyond the allowlist, such as a watermark overlay, opts in with `overrideTransformationAllowlist: true`. The helper then signs any transformation. It still applies the access rule; only `overrideAccess` skips that.

```typescript
const url = await getSignedURL({
  payload: req.payload,
  collection: 'media',
  docId: id,
  req,
  // Built here, in server code. Never from the request.
  transformations: { overlay: { font_family: 'Arial', font_size: 40, text: 'CONFIDENTIAL' } },
  overrideTransformationAllowlist: true,
})
```

Never pass request input with `overrideTransformationAllowlist`. An `overlay` or `underlay` can name another private asset (`l_authenticated:<public id>`), and the signed URL would show it to a reader who may have only this file.

`getPrivateImageURL` and `getPremiumImageURL` take no caller transformations. With `includeTransformations`, they sign the collection's default transformations and the document's selected presets, which come from your config.

### Primitives: `generateSignedURL`, `generateDownloadURL` and `getTransformationUrl`

These build a URL from the public ID and transformations you give them. They check no access and no allowlist: for an `authenticated` asset they sign any public ID and any transformation. Only trusted server code may call them, and never with a public ID or transformations taken from a request. A route that signs `req.query.publicId` with `generateSignedURL` hands every private original to anyone who knows or guesses a public ID. To serve a reader, use `getSignedURL`, `getServerImageURL` or the endpoints.

### `isAccessAllowedByID`

`isAccessAllowedByID({ req, collection, id })` answers whether the reader may get the original, decided exactly as the plugin decides it. It looks the document up with your collection's `read` access enforced, reads it as stored, and runs your `customAuthCheck` and `publicTransformation` on it in every configured locale, like the endpoints and the server helpers. It reads the collection's config from the installed plugin, so you don't pass it.

```typescript
import { isAccessAllowedByID } from 'payload-storage-cloudinary'

const allowed = await isAccessAllowedByID({ req, collection: 'premium', id })
```

It returns `true` exactly when `getSignedURL` returns a URL for the same reader and document. It returns `false` when the reader may not read the document, when there is no such document or it has no Cloudinary file, when any locale refuses the original (a reader who may get only the preview included), and when the plugin can't read the stored document. A file that isn't private is `true` for anyone who may read the document. There is no `overrideAccess`.

#### Deprecated: `isAccessAllowed(req, doc, config)`

The form that takes a document still works, but is deprecated, and logs a warning the first time it runs. It decides only on the document you give it, in the one locale that document is in. It doesn't look the document up, so it doesn't run your collection's `read` access, and on a localized site it doesn't run your check in every locale as the plugin does.

Never give it a raw database row, such as one from `payload.db.findOne`, on a collection with localized fields. The row holds each localized field keyed by locale (`{ en: true }`), so a check such as `doc.locked !== true` passes for every reader, and your site hands out the original of a locked file. Move to `isAccessAllowedByID`.

Called the 1.2.x way, with a bare `SignedURLConfig` (for example `{ enabled: true, customAuthCheck }`) or no config at all, it can't tell whether the collection uses `publicTransformation`, so it fails closed: it returns your `customAuthCheck`'s answer when the config has one, and `false` when it doesn't. The plugin logs a second warning the first time it sees this shape.

## Security Features

1. **Authenticated Storage**: Private originals are `authenticated` assets. An unsigned URL, or a guessed public ID, gets a 401 from Cloudinary
2. **Signed Delivery**: The signature covers the transformation and the public ID. An edited URL gets a 401
3. **Transformation Protection**: The endpoints apply caller-supplied transformations only for callers who may get the original, and sign only the size, crop, quality and format keys listed under [Transformations](#transformations). A layer, a named transformation or any other key returns 400. The server helpers apply the same allowlist unless the caller passes `overrideTransformationAllowlist: true` (see [Transformations in the server helpers](#transformations-in-the-server-helpers))
4. **No Expiry**: Signed URLs don't expire. Treat them as bearer links

Expiring links need Cloudinary token authentication, which is a paid Cloudinary feature. The plugin doesn't support it.

## Use Cases

### 1. Paid Content Delivery

```typescript
collections: {
  premiumContent: {
    privateFiles: {
      enabled: true,
      customAuthCheck: async (req, doc) => {
        return req.user?.subscription?.active
      }
    }
  }
}
```

### 2. Share Links

`generateSignedURL` is a primitive: it signs any public ID with no access check. Call it only from trusted server code, with a document you already checked the reader may have, never with a public ID from a request.

```typescript
// The link doesn't expire. Share it only with someone allowed to see the file.
const shareUrl = generateSignedURL({
  publicId: doc.cloudinaryPublicId,
  version: doc.cloudinaryVersion,
  format: doc.cloudinaryFormat,
  deliveryType: doc.cloudinaryType,
})
```

### 3. Watermarked Previews

Turn on `publicTransformation` and render the document's `previewUrl`. The plugin builds it for every reader who may read the document, with the selected presets and then the watermark or blur, signed for an `authenticated` original. A file uploaded before 1.3.0 and not yet migrated gets an unsigned preview. See [Previews for Private Files](./public-transformation-example.md) and [Files Uploaded Before 1.3.0](./public-transformation-example.md#files-uploaded-before-130).

To build a watermarked URL yourself, sign the watermark in. Never add it to a signed URL afterwards. The watermark is part of the signature only when `deliveryType` is `authenticated`. An `upload` URL is unsigned, so anyone can remove its watermark. For a reader, pass the watermark to `getSignedURL` with `overrideTransformationAllowlist: true` (see [Transformations in the server helpers](#transformations-in-the-server-helpers)), so the access rule still runs. `generateSignedURL` below is the primitive, for trusted server code only.

```typescript
// For an authenticated asset, the watermark is part of the signature, so removing it breaks the URL
const previewUrl = generateSignedURL({
  publicId: doc.cloudinaryPublicId,
  version: doc.cloudinaryVersion,
  format: doc.cloudinaryFormat,
  deliveryType: doc.cloudinaryType,
  transformations: {
    overlay: 'watermark',
    gravity: 'center',
    opacity: 50
  }
})
```

## Best Practices

1. **Bearer Links**: Hand a signed URL only to a reader allowed to see the file, and don't log or store it where others can read it
2. **Cache Headers**: Configure appropriate cache headers
3. **Preload URLs**: Generate URLs before they're needed
4. **Monitoring**: Track URL generation and usage

## Troubleshooting

### Common Issues

1. **403 Forbidden**: The collection's `read` access or `customAuthCheck` refused the caller, or the collection has `publicTransformation` and no `customAuthCheck`
2. **404 Not Found**: The document does not exist, or the collection's `read` access returns a query that excludes it
3. **401 from Cloudinary**: The URL is unsigned, edited, or signed with other credentials. Build it again through the plugin
4. **404 from Cloudinary**: The URL's delivery type doesn't match the asset. A private file uploaded before 1.3.0 with `publicTransformation` is an `upload` asset until you migrate it
5. **Transformation Blocked**: Enable `includeTransformations`
6. **"Refused the transformations" from a server helper**: A `transformations` key or value is outside the allowlist. Use only the allowed keys, set the transformation on the collection, or, for a transformation built in trusted server code, pass `overrideTransformationAllowlist: true`

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
- A signed URL stays valid, so it can be cached. Fetch a new one when the reader's access may have changed
- Batch endpoints reduce API calls
- Consider CDN integration for global delivery

## Migration Guide

Converting existing public files to private:

1. Update collection configuration
2. Run migration script to update existing files
3. Update frontend to use signed URLs
4. Test access control thoroughly
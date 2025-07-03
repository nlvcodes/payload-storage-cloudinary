# Upload Queue System

The upload queue system provides efficient handling of large file uploads with progress tracking, concurrent upload management, and chunked uploads for very large files.

## Configuration

Enable the upload queue in your collection configuration:

```typescript
cloudinaryStorage({
  collections: {
    media: {
      uploadQueue: {
        enabled: true,
        maxConcurrentUploads: 3,
        chunkSize: 20, // MB
        enableChunkedUploads: true,
        largeFileThreshold: 100, // MB
      },
    },
  },
})
```

## Configuration Options

- **enabled** (boolean): Enable/disable the upload queue
- **maxConcurrentUploads** (number): Maximum simultaneous uploads (default: 3)
- **chunkSize** (number): Size of chunks in MB for large files (default: 20)
- **enableChunkedUploads** (boolean): Enable chunked uploads for large files (default: true)
- **largeFileThreshold** (number): File size in MB above which to use chunked upload (default: 100)

## Features

### 1. Concurrent Upload Management

The queue system manages multiple uploads simultaneously while preventing system overload:

```typescript
uploadQueue: {
  enabled: true,
  maxConcurrentUploads: 5, // Process up to 5 uploads at once
}
```

### 2. Progress Tracking

Track upload progress in real-time:

```typescript
// Upload status is stored in the document
{
  uploadStatus: 'uploading', // 'queued' | 'uploading' | 'completed' | 'failed'
  uploadProgress: 45, // Percentage (0-100)
}
```

### 3. Chunked Uploads

Large files are automatically split into chunks for more reliable uploads:

```typescript
uploadQueue: {
  chunkSize: 50, // 50MB chunks
  largeFileThreshold: 200, // Files > 200MB use chunked upload
}
```

### 4. Queue Status API

Monitor upload status via REST endpoints:

```bash
# Get status for specific upload
GET /api/media/upload-status/:uploadId

# Get all upload statuses
GET /api/media/upload-status

# Cancel a queued upload
POST /api/media/upload-cancel/:uploadId
```

## Usage Examples

### Basic Configuration

```typescript
collections: {
  media: {
    uploadQueue: {
      enabled: true,
    },
  },
}
```

### Advanced Configuration for Videos

```typescript
collections: {
  videos: {
    uploadQueue: {
      enabled: true,
      maxConcurrentUploads: 2, // Limit concurrent video uploads
      chunkSize: 100, // Larger chunks for videos
      largeFileThreshold: 500, // Videos > 500MB use chunked upload
    },
  },
}
```

### React Component for Progress Display

```tsx
function UploadProgressBar({ doc }) {
  if (!doc.uploadStatus || doc.uploadStatus === 'completed') {
    return null
  }
  
  return (
    <div className="upload-progress">
      <div className="status">{doc.uploadStatus}</div>
      <progress value={doc.uploadProgress} max="100">
        {doc.uploadProgress}%
      </progress>
    </div>
  )
}
```

### Monitoring Multiple Uploads

```typescript
async function getQueueStatus(collectionSlug) {
  const response = await fetch(`/api/${collectionSlug}/upload-status`)
  const data = await response.json()
  
  return data.uploads.filter(u => 
    u.status === 'queued' || u.status === 'uploading'
  )
}
```

## Benefits

1. **Better User Experience**: Users can track upload progress
2. **Reliability**: Chunked uploads handle network interruptions better
3. **Performance**: Concurrent uploads optimize bandwidth usage
4. **Scalability**: Queue prevents server overload
5. **Control**: Ability to cancel queued uploads

## Best Practices

1. **File Size Limits**: Set appropriate thresholds based on your server capacity
2. **Concurrent Uploads**: Balance between speed and server load
3. **Chunk Size**: Larger chunks = fewer requests, smaller chunks = better recovery
4. **Monitoring**: Implement UI to show upload progress
5. **Error Handling**: Provide clear feedback for failed uploads

## Limitations

- Cannot cancel uploads that have already started
- Chunked upload implementation is simplified (full Cloudinary chunked upload API requires additional setup)
- Progress tracking is approximate for streamed uploads

## Future Enhancements

- Resume interrupted uploads
- Priority queue for important uploads
- Bandwidth throttling
- Detailed upload analytics
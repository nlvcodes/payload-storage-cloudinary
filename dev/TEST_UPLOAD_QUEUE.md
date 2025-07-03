# Testing Upload Queue

## Quick Test

1. **Start the dev server:**
   ```bash
   cd dev
   pnpm dev
   ```

2. **Create a large test file (150MB):**
   ```bash
   # On macOS/Linux:
   dd if=/dev/random of=test-large.bin bs=1M count=150

   # Or use the test script:
   node test-upload-queue.js
   ```

3. **Test the queue:**
   - Go to http://localhost:3000/admin/media
   - Upload the test file
   - Watch the terminal for queue activity

## What You Should See

### For files < 400MB:
- Normal upload through the queue
- Progress updates in the network tab

### For files > 400MB:
- Chunked upload (20MB chunks)
- Multiple requests in network tab
- Longer upload time but more reliable

### When uploading multiple files:
- Only 3 upload simultaneously (as configured)
- Others wait in queue
- Queue processes them in order

## Configuration in payload.config.ts:

```typescript
uploadQueue: {
  enabled: true,
  maxConcurrentUploads: 3,
  chunkSize: 20,              // 20MB chunks
  enableChunkedUploads: true,
  largeFileThreshold: 400,    // Files > 400MB use chunked upload
}
```

## Testing Different Scenarios

1. **Single large file**: Tests chunked upload
2. **Multiple small files**: Tests concurrent upload limit
3. **Mix of sizes**: Tests queue prioritization
4. **Network interruption**: Pause/resume in browser DevTools

## Monitoring

Open browser DevTools:
- **Network tab**: See upload requests
- **Console**: Any client-side errors
- **Terminal**: Server-side logs

## Clean Up

After testing:
```bash
rm test-*.bin
```

Or clean up in Cloudinary dashboard if needed.
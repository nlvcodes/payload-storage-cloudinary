# Handling Updates Without File Changes

## Issue

When updating a document in Payload CMS that has an upload field, the `handleUpload` function may be called even when no new file is being uploaded. This can lead to unnecessary re-uploads to Cloudinary, causing:

- Duplicate files in Cloudinary
- Increased storage costs
- Slower update operations
- New public IDs for the same content

## Solution

The plugin now includes comprehensive detection logic to prevent unnecessary re-uploads:

### 1. No Buffer Check

If `file.buffer` is not present but `data.cloudinaryPublicId` exists, the handler returns early without processing.

```typescript
if (data.cloudinaryPublicId && !file.buffer) {
  console.log('[Cloudinary Upload] Skipping upload - no new file provided, keeping existing Cloudinary asset')
  return
}
```

### 2. Replacement Files

When an update carries a new file, the handler uploads it. `@payloadcms/plugin-cloud-storage` deletes the old asset before the handler runs, so a replacement always uploads, even when its filename matches the stored one:

- The replacement uploads with the document's privacy setting and folder. A save that also changes "Private File" uploads the file as `authenticated` or `upload` to match.
- The document stores the new public ID, `cloudinaryType`, version and file data.
- A private replacement clears the delivery URLs stored for the file it replaces.
- The replacement's width and height replace the stored ones. A file without dimensions stores none.
- If the replacement upload fails, the old asset is already gone. That order belongs to `@payloadcms/plugin-cloud-storage`.

Before 1.3.0 the handler compared filenames and skipped the upload on a match. The storage plugin names the incoming file after the document, so every replacement matched, and the document pointed at the deleted asset.

### 3. Smart Asset Moving

When folder paths change, the plugin moves the asset instead of re-uploading:

- Uses Cloudinary's `rename` API, from the asset's stored delivery type, so private (`authenticated`) assets move too
- Keeps the file name part of the public ID, and the version
- A public file's stored URLs point at the new location. A private file stores no delivery URL: its URLs are built when the document is read
- Maintains all transformations and metadata
- The move happens before the save. If the save then fails, for example on a validation error, the plugin moves the asset back (see [When a save fails](#when-a-save-fails))

### 4. Privacy Changes

When you check or uncheck "Private File" on a saved file, the plugin moves the asset to the matching Cloudinary delivery type instead of re-uploading:

- Private files become `authenticated` assets, and public files become `upload` assets
- Uses Cloudinary's `rename` API with `to_type` and `invalidate: true`, and stores the new type in `cloudinaryType`
- Writes no delivery URL: URLs are built when the document is read
- A folder change and a privacy change in the same save make one rename
- If Cloudinary refuses the rename, the save fails with an error and the file stays as it was

The plugin never leaves a file at a public `upload` URL while the stored document says it is private. When it can't keep the two in step, it leaves a broken link rather than an exposed file:

- **Checking the box** moves the asset to `authenticated` before the save. A file that is private too early exposes nothing.
- **Unchecking the box** moves the asset to `upload` only after the save has written the document, in an `afterChange` hook that runs on the save's request, so its writes join the save's transaction. A save that fails validation or a hook before then leaves the asset `authenticated` and the document private.
- **With drafts**, a draft that unchecks the box leaves the asset `authenticated` while the published document is private. The move happens when the change is published.

### When a save fails

When a save that moved an asset fails, the plugin moves the asset back in an `afterError` hook, so the asset matches the stored document again. It moves the asset back only when the stored document still records the old asset, and never to `upload` while the document says the file is private.

- Payload runs a collection's `afterError` hooks for its REST routes only, which the admin panel uses to save. A failed GraphQL or Local API call gets no hook, so the asset stays where the move left it until the next save. A file being made private stays `authenticated`, which is a broken link at worst. A file being made public can stay at `upload` only when a hook or the commit fails after the plugin's `afterChange` hook, so the plugin adds its hook after the collection's own `afterChange` hooks.
- A database adapter without transactions (the SQLite adapter unless you set `transactionOptions`) keeps every write made before the failure. The plugin writes the privacy and folder fields back when the move to `upload` fails, and otherwise the stored document already records where the asset is.

### Known limitation: two saves at once without transactions

On a database adapter without transactions, two editors saving the same document at the same moment can leave a file that one of them is making public stored as private, with its asset at `upload`. The other save writes "Private File" checked between the plugin's check of the stored document and its move to `upload`, and the plugin then records the `upload` type on the private document. The original is at a public URL until you fix it, and saving the document again with the box still checked does not move it back.

To fix a file in this state, run `migratePrivateAssets` (see [Files Uploaded Before 1.3.0](./public-transformation-example.md#files-uploaded-before-130)): it moves every private document whose stored type isn't `authenticated` back to `authenticated`, and its dry run lists them. Unchecking the box, saving, then checking it and saving again also moves it back. To prevent it, turn on transactions (`transactionOptions` on the SQLite adapter) or keep two editors off the same file at once.

## Debug Output

### When updating without file changes:

```
[Cloudinary Upload] Starting upload for collection: media
[Cloudinary Upload] File: example.jpg Size: 12345 Has buffer: false
[Cloudinary Upload] Skipping upload - no new file provided, keeping existing Cloudinary asset
```

### When folder changes:

```
[Cloudinary Upload] Folder changed from 'uploads' to 'products/2024'
[Cloudinary Upload] Moving asset instead of re-uploading
[Cloudinary Upload] Asset moved successfully
```

## Current Behavior

### ✅ Prevented Re-uploads

The plugin now prevents re-uploads in these scenarios:
- Updating alt text or other metadata fields
- Changing transformation presets
- Modifying folder paths (uses move instead)
- Toggling privacy settings (uses a rename to the new delivery type instead)
- Any update that doesn't involve a new file

### ✅ Allowed Uploads

The plugin still allows uploads when:
- A new file is selected, whatever its filename
- No cloudinaryPublicId exists (initial upload)

## Implementation Details

The upload handler uses multiple checks to ensure accuracy:

1. **Buffer Presence**: Checks if `file.buffer` exists
2. **Public ID Existence**: Verifies `data.cloudinaryPublicId` is present
3. **Early Return**: Exits immediately when there is no buffer and a public ID exists

This approach is:
- **Safe**: Never skips legitimate uploads
- **Efficient**: Prevents unnecessary API calls
- **Reliable**: Uses multiple validation checks
- **Transparent**: Provides clear logging

## Testing

To verify the fix is working:

1. Upload a file to your collection
2. Update the document's alt text or other fields
3. Check the console logs - you should see "Skipping re-upload"
4. Verify the cloudinaryPublicId remains the same
5. Check your Cloudinary dashboard - no duplicate files should appear

## Benefits

With this fix, you can:
- Update metadata without worrying about re-uploads
- Change transformation presets without creating duplicates
- Modify folder paths and have assets moved automatically
- Maintain consistent public IDs across updates
- Reduce Cloudinary storage costs
- Improve admin UI performance

## Migration from Previous Versions

If you were experiencing re-upload issues with earlier versions:

1. Update to the latest version
2. Existing duplicates will remain (but no new ones will be created)
3. You can manually clean up duplicates in your Cloudinary dashboard
4. Consider using the `deleteFromCloudinary: false` option temporarily while cleaning up

## Advanced Configuration

For additional control over upload behavior:

```typescript
cloudinaryStorage({
  collections: {
    media: {
      // Prevent deletion during cleanup
      deleteFromCloudinary: false,
      
      // Enable folder moves
      folder: {
        path: 'uploads',
        enableDynamic: true,
      },
      
      // Preserve originals for maximum flexibility
      transformations: {
        preserveOriginal: true,
      },
    },
  },
})
```

This configuration ensures maximum safety while preventing any unnecessary uploads or deletions.
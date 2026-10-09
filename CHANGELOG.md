# Changelog

All notable changes to this project will be documented in this file.

## [1.3.0] - 2026-10-09

Fixes [GHSA-gm3h-g6v2-2cpf](https://github.com/nick-vogel/payload-storage-cloudinary/security/advisories/GHSA-gm3h-g6v2-2cpf): private files exposed through signed-URL endpoints, stored URLs and public transformations (1.0.0 to 1.2.1). The upgrade has breaking changes and needs a migration step. The [1.3.0 release notes](https://github.com/nick-vogel/payload-storage-cloudinary/releases/tag/v1.3.0) hold the full list, the upgrade steps, and workarounds for sites that can't upgrade yet.

### Security
- One access rule decides who gets the original, the preview, or nothing. The signed URL endpoints, every read, and the server helpers apply it, on top of your collection's `read` access
- The rule decides on the stored document in every configured locale, whatever the read selected
- Private originals upload to Cloudinary as `authenticated`, also on `publicTransformation` collections, and no public copy is uploaded
- Delivery URLs are built at read time and no longer stored
- The signed URL endpoints sign only allowed transformations, and so do `getSignedURL`, `getSignedURLs` and `getServerImageURL` unless trusted server code passes `overrideTransformationAllowlist: true`
- Fields the plugin writes are read-only to API writes
- A privacy or folder change moves the asset on Cloudinary and keeps it in step with the document

### Added
- `migratePrivateAssets` and `MigrationStoppedError`, to move private files uploaded before 1.3.0
- `isAccessAllowedByID({ req, collection, id })`
- `cloudinaryType` field (needs a Payload migration on Postgres and SQLite)
- `changeDeliveryType`, and a `deliveryType` option on `generateSignedURL` and `generateDownloadURL`
- `overrideTransformationAllowlist` on the server helpers
- `SECURITY.md`

### Changed
- **BREAKING**: the server helpers enforce access by default. Pass `req`, or `overrideAccess: true` for trusted jobs
- **BREAKING**: `customAuthCheck` receives the stored document, once per configured locale
- **BREAKING**: the endpoints no longer return `expiresIn` or `expiresAt`, and the client helpers throw the endpoint's error text
- **BREAKING**: `CloudinaryDocumentData.width` and `height` are `number | null`
- **BREAKING**: the signed URL endpoints and three server helpers answer 400 for a transformation outside the allowlist
- **BREAKING**: the batch endpoint takes at most 100 IDs, and returns a result with an `error` for each refused ID
- **BREAKING**: `isAccessAllowed` fails closed. With a bare `SignedURLConfig` or no config and no `customAuthCheck`, it returns `false`
- **BREAKING**: `generateSignedURL` and `generateDownloadURL` build `authenticated` URLs by default
- **BREAKING**: a preview with no `watermark` settings carries the text `WATERMARK`
- **BREAKING**: a Local API read without `req` reads as an anonymous visitor, so it gets `null` URLs on a collection with `customAuthCheck` or `publicTransformation`
- **BREAKING**: `url` carries the collection's default transformations
- **BREAKING**: `getServerImageURL`, `getPrivateImageURL` and `getPremiumImageURL` no longer return the document's `url` for a public file, and can return `null` for one
- Every Cloudinary collection sets `forceSelect` to the plugin's asset fields
- The package's repository, bugs and homepage links point at `nick-vogel/payload-storage-cloudinary`

### Deprecated
- `isAccessAllowed(req, doc, config)`, in favor of `isAccessAllowedByID`
- `authToken` and `expiresIn` in `privateFiles` (ignored; signed URLs don't expire)
- `applyTransformationsToUrl`, `pluginOptions` on the server helpers, `publicTransformationUrl`, and the second argument of `getPublicPreviewURL`

### Fixed
- `transformations` objects without a `default` key no longer drop `presets`, `enablePresetSelection`, `preserveOriginal` and `publicTransformation`
- Deleting a private document deletes its `authenticated` asset
- Moving a private file to another dynamic folder works
- A replacement file on a saved document uploads to Cloudinary. Before, the upload was skipped after the old asset was deleted

## [1.0.5] - 2025-01-06

### Added
- **getCloudinaryFolders Helper**: New helper function to fetch Cloudinary folders for custom implementations
- **Automatic Folder Moves**: When folder changes, assets are moved in Cloudinary instead of duplicated
- Complete example of custom folder selection field with dropdown and text input modes
- Documentation for implementing custom folder selection UI
- beforeChange hook to detect folder changes and use Cloudinary's rename API

### Changed
- Simplified approach to custom folder selection - users implement their own field components
- Added example code showing the working pattern for folder selection

## [1.0.3] - 2025-01-03

### Removed
- **BREAKING CHANGE**: Removed folder dropdown selection feature entirely
- Removed FolderSelector component and related client-side components
- Removed CloudinaryFolderProvider context
- Removed `/cloudinary/folders` API endpoint
- Removed `useFolderSelect` configuration option

### Changed
- Dynamic folders now only support text input mode (`enableDynamic: true`)
- Updated all documentation to remove references to dropdown folder selection
- Simplified folder management approach for better reliability

### Why This Change
The folder dropdown feature had persistent issues with Payload v3's form state integration. The save button wouldn't activate and selected values weren't properly persisted. Rather than maintain a broken feature, we removed it in favor of the reliable text input approach.

### Migration
If you were using `useFolderSelect: true`, simply remove this option. Dynamic folders will continue to work with text input where users can type folder paths.

## [1.0.2] - 2025-01-03

### Changed
- Updated all documentation to reflect current implementation
- Removed outdated references to function-based folder configuration
- Combined transformations and transformation-presets documentation
- Fixed markdown formatting issues throughout docs
- Clarified that `privateFiles: true` automatically enables signed URLs

### Added
- Documentation for built-in dropdown folder selection with `useFolderSelect`
- Known limitations section in README explaining dynamic folder save issue
- Comprehensive examples for using transformation presets
- Common folder structure examples in dynamic folders guide

### Fixed
- Removed references to non-existent features (radio toggle, commonFolders)
- Updated migration guide with accurate information
- Clarified access control documentation
- Fixed formatting issues in multiple documentation files

### Documentation
- Comprehensive update of all documentation files to match current implementation
- Added workarounds for known limitations
- Improved frontend transformation examples
- Better organization of configuration options

## [1.0.1] - 2025-01-03

### Fixed
- Use Cloudinary's `upload_large` API for files over 100MB instead of base64 conversion
- Fix 413 "Payload Too Large" errors for large video uploads
- Improve access control implementation to properly integrate with Payload's system
- Remove flawed owner-based access check that could cause "noisy neighbor" issues

### Changed
- Clarified that `customAuthCheck` runs AFTER Payload's built-in access control
- Updated documentation about file size limits based on Cloudinary plans

### Security
- Ensure plugin properly relies on Payload's built-in access control system
- Fix potential security issues by not bypassing collection-level access control

## [1.0.0] - 2025-01-03

### Added
- Initial release with full Cloudinary integration for Payload CMS v3
- Dynamic folder selection with text input
- Transformation presets with admin UI selection
- Upload queue for handling large files
- Private files with signed URL support
- TypeScript support with full type definitions
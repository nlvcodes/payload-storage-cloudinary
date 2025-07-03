# Changelog

All notable changes to this project will be documented in this file.

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
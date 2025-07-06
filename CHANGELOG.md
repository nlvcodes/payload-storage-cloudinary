# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

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
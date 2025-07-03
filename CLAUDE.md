# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is a Cloudinary storage adapter plugin for Payload CMS v3. It replaces the default local file storage with Cloudinary's cloud storage service, providing automatic image optimization, transformations, and CDN delivery.

## Build and Development Commands

```bash
# Install dependencies
pnpm install

# Build the plugin
pnpm build              # Runs both TypeScript and SWC builds
pnpm build:types        # Generate TypeScript definitions only
pnpm build:swc          # Compile with SWC only

# Development
pnpm dev                # Watch mode for SWC compilation

# Testing
pnpm test               # Run tests with Vitest
pnpm test:coverage      # Run tests with coverage report

# Code quality
pnpm lint               # Run ESLint
pnpm lint:fix           # Run ESLint with auto-fix
pnpm format             # Format code with Prettier

# Utilities
pnpm clean              # Remove dist folder
pnpm prepublishOnly     # Clean and build before publishing
```

## Architecture

### Plugin Structure

The plugin follows Payload's cloud storage adapter pattern, built on top of `@payloadcms/plugin-cloud-storage`:

1. **Entry Point** (`src/index.ts`): 
   - Exports `cloudinaryStorage` function that returns a Payload plugin
   - Validates required Cloudinary credentials
   - Creates collection-specific adapter configurations
   - Wraps everything in the base `cloudStoragePlugin`

2. **Handler Architecture** (`src/handlers/`):
   - Each handler implements a specific interface from `@payloadcms/plugin-cloud-storage/types`
   - Handlers receive collection context and options from the main plugin
   - All handlers are factory functions that return the actual handler implementation

3. **Key Design Decisions**:
   - The plugin doesn't directly implement the storage interface - it configures the base cloud storage plugin
   - Each collection gets its own adapter instance with shared handlers
   - Cloudinary public_id is stored in the document data for accurate deletion
   - All optional configurations default to `undefined` to use Cloudinary's defaults

### Handler Responsibilities

- **handleUpload**: Streams file buffer to Cloudinary, stores the public_id in document data
- **handleDelete**: Removes files from Cloudinary using stored public_id or extracted from URL
- **generateURL**: Creates Cloudinary URLs with optional transformations
- **staticHandler**: Redirects requests to Cloudinary CDN

### Testing Environment

The `dev/` folder contains a Next.js + Payload v3 test application configured to use the plugin. It includes:
- A `media` collection configured for Cloudinary uploads
- A `products` collection with upload fields for testing relationships

## Important Implementation Details

1. **ESM Module**: The plugin is built as an ES module (`"type": "module"` in package.json)

2. **Cloudinary Integration**: 
   - Uses Cloudinary v2 SDK
   - Supports all Cloudinary transformation options through the `transformations` config
   - Automatically detects resource types with `resource_type: 'auto'`
   - Implements chunked uploads for large files (>100MB)
   - Stores file size using Cloudinary's byte count

3. **Per-Collection Configuration**:
   - Collections can use simple boolean (`media: true`) or detailed configuration
   - Each collection can have different folders, transformations, and settings
   - All settings are optional and default to Cloudinary's defaults
   - Folder configuration supports both string (legacy) and object format
   - Transformation configuration supports both direct transformations and organized structure

4. **Configuration Structure** (as of latest version):
   - `folder`: Can be string or `FolderConfig` object with `path`, `enableDynamic`, `fieldName`
   - `transformations`: Can be direct transformations or `TransformationConfig` with `default`, `presets`, `enablePresetSelection`, `preserveOriginal`
   - `privateFiles`: Can be boolean (true = default 1hr signed URLs) or full `SignedURLConfig`
   - `deleteFromCloudinary`: Boolean to control whether files are deleted from Cloudinary (default: true)
   - Backward compatibility maintained through `normalizeConfig.ts`

5. **Dynamic Folder Implementation**:
   - When `enableDynamic` is true, adds a text field for folder path entry
   - Users can type folder paths like `products/2024` or `blog/images`
   - Folders are automatically created in Cloudinary if they don't exist
   - The folder path is stored with the document for reference

6. **Private Files Implementation**:
   - `privateFiles` configuration automatically enables signed URLs
   - When `privateFiles: true`, uses default 1-hour expiry
   - Can pass full `SignedURLConfig` for custom settings
   - Legacy `signedURLs` field is mapped to `privateFiles` for backward compatibility

7. **Frontend Transformations**:
   - The `url` field contains default transformations (if configured)
   - The `thumbnailURL` is always a 150x150 thumbnail for admin UI
   - Three methods for applying transformations on frontend:
     - Direct URL string manipulation (simplest)
     - `getTransformationUrl` helper function (type-safe)
     - Custom URL building (full control)

8. **Build Process**:
   - Uses SWC for fast TypeScript compilation
   - TypeScript for type definitions
   - Outputs to `dist/` with flattened structure

## Testing the Plugin

To test with real Cloudinary credentials:

1. Set up credentials in `dev/.env`:
   ```env
   CLOUDINARY_CLOUD_NAME=your-cloud-name
   CLOUDINARY_API_KEY=your-api-key
   CLOUDINARY_API_SECRET=your-api-secret
   ```

2. Start the test environment:
   ```bash
   cd dev
   pnpm install
   pnpm dev
   ```

3. Access http://localhost:3000/admin to test uploads

## Configuration Example

```typescript
cloudinaryStorage({
  cloudConfig: {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  },
  collections: {
    media: true, // Simple configuration
    avatars: {   // Detailed configuration
      // Organized folder configuration
      folder: {
        path: 'avatars',
        enableDynamic: true,
        fieldName: 'customFolder',
      },
      // Organized transformation configuration
      transformations: {
        default: {
          quality: 'auto',
          fetch_format: 'auto',
        },
        presets: commonPresets,
        enablePresetSelection: true,
        preserveOriginal: true,
      },
      // Simplified private files configuration
      privateFiles: true,  // Automatically enables signed URLs with 1hr expiry
      // Or with custom config:
      // privateFiles: {
      //   enabled: true,
      //   expiresIn: 7200, // 2 hours
      // },
      
      // Control Cloudinary deletion
      deleteFromCloudinary: false,  // Keep files in Cloudinary after deletion
      
      // Upload queue for large files
      uploadQueue: {
        enabled: true,
        maxConcurrentUploads: 3,
        enableChunkedUploads: true,
        largeFileThreshold: 100, // MB
      },
    },
  },
})
```

## Recent Changes and Decisions

### Session Updates (Latest):

1. **Removed Folder Dropdown Feature**:
   - Removed all folder dropdown selection components and functionality
   - Removed FolderSelector component, CloudinaryFolderProvider, and cloudinaryFolders endpoint
   - Dynamic folders now only support text input mode (`enableDynamic: true`)
   - Updated all documentation to remove references to dropdown selection
   - The feature was removed due to form state integration issues with Payload v3

### Previous Session Updates:

1. **Configuration Reorganization**:
   - Folder options now under `folder` object (path, enableDynamic, fieldName)
   - Transformation options under `transformations` object (default, presets, etc.)
   - Added `normalizeConfig.ts` to handle backward compatibility

2. **File Size Implementation**:
   - Now using Cloudinary's byte count from upload response
   - Added visible `filesize` field in admin UI

3. **Large File Uploads**:
   - Implemented chunked upload for files >100MB
   - Better error messages for file size and format issues
   - 10-minute timeout for large uploads

4. **Private Files Simplification**:
   - Combined `privateFiles` and `signedURLs` into single `privateFiles` option
   - `privateFiles: true` auto-enables signed URLs with 1hr default
   - Can pass full config object for custom settings

5. **Optional Cloudinary Deletion**:
   - Added `deleteFromCloudinary` option (default: true)
   - When false, files remain in Cloudinary after Payload deletion

6. **Frontend Transformations Documentation**:
   - Created comprehensive guide for applying transformations
   - Three methods: URL manipulation, helper function, custom building
   - Added examples for responsive images, lazy loading, etc.

### Known Issues and Limitations:

1. **Frontend Confusion**:
   - Users often confused why they get thumbnail instead of transformed images
   - Clarified that `url` has default transformations, `thumbnailURL` is always 150x150
   - Added clear documentation and examples
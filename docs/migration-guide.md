# Migration Guide

This guide helps you migrate from older configuration formats to the new organized structure.

## Configuration Changes

### Folder Configuration

**Old:**
```typescript
collections: {
  media: {
    folder: 'uploads',
    enableDynamicFolders: true,
    folderField: 'cloudinaryFolder',
  }
}
```

**New:**
```typescript
collections: {
  media: {
    folder: {
      path: 'uploads',
      enableDynamic: true,
      fieldName: 'cloudinaryFolder',
    }
  }
}
```

**Shorthand (for simple cases):**
```typescript
collections: {
  media: {
    folder: 'uploads', // Still supported for backward compatibility
  }
}
```

### Transformation Configuration

**Old:**
```typescript
collections: {
  media: {
    transformations: {
      quality: 'auto',
      fetch_format: 'auto',
    },
    transformationPresets: commonPresets,
    enablePresetSelection: true,
    presetField: 'transformationPreset',
  }
}
```

**New:**
```typescript
collections: {
  media: {
    transformations: {
      default: {
        quality: 'auto',
        fetch_format: 'auto',
      },
      presets: commonPresets,
      enablePresetSelection: true,
      presetFieldName: 'transformationPreset',
      preserveOriginal: true, // New option
    }
  }
}
```

**Shorthand (for simple cases):**
```typescript
collections: {
  media: {
    transformations: {
      quality: 'auto',
      fetch_format: 'auto',
    }
  }
}
```

### Private Files Configuration

**Old:**
```typescript
collections: {
  documents: {
    privateFiles: true,
    signedURLs: {
      enabled: true,
      expiresIn: 3600,
    }
  }
}
```

**New (simplified):**
```typescript
collections: {
  documents: {
    privateFiles: true, // Automatically enables signed URLs with 1-hour expiry
  }
}

// Or with custom configuration:
collections: {
  documents: {
    privateFiles: {
      enabled: true,
      expiresIn: 7200, // 2 hours
      // ... other signed URL options
    }
  }
}
```

The `signedURLs` field is now deprecated. Use `privateFiles` instead, which can be either:
- `true` - Enables private files with default signed URL settings (1-hour expiry)
- A `SignedURLConfig` object - For custom signed URL configuration
- `false` or `undefined` - Files are public (default)

## New Features

### Preserve Original Images
When applying transformations, you can now preserve the original image:

```typescript
transformations: {
  default: {
    width: 800,
    height: 600,
  },
  preserveOriginal: true, // Original remains untransformed
}
```

### Control Cloudinary Deletion
You can now control whether files are deleted from Cloudinary when removed from Payload:

```typescript
collections: {
  media: {
    deleteFromCloudinary: false, // Keep files in Cloudinary even after deletion
  }
}
```

### Enhanced Upload Queue
Better support for large files, especially videos:

```typescript
uploadQueue: {
  enabled: true,
  maxConcurrentUploads: 3,
  enableChunkedUploads: true, // New
  largeFileThreshold: 100, // MB - files larger than this use chunked upload
  chunkSize: 20, // MB
}
```

### File Size Display
File size is now displayed in the admin UI by default. The `filesize` field is automatically added and shows the file size in bytes.

## Backward Compatibility

The plugin maintains backward compatibility with the old configuration format. Your existing configurations will continue to work, but we recommend migrating to the new structure for better organization and access to new features.

The plugin automatically normalizes old configurations to the new format internally, so you can migrate at your own pace.

## Dynamic Folder Selection

### Built-in Folder Select (New)
The plugin now includes built-in dynamic folder selection:

```typescript
collections: {
  media: {
    folder: {
      path: 'uploads',
      enableDynamic: true,
      useFolderSelect: true, // Enable dropdown folder selection
    }
  }
}
```

This provides a dropdown of existing Cloudinary folders with the option to create new ones.

### Manual Entry (Default)
By default, dynamic folders use a text input:

```typescript
collections: {
  media: {
    folder: {
      path: 'uploads',
      enableDynamic: true, // Text input for folder path
    }
  }
}
```

## Known Limitations

1. **Dynamic Folder Save Issue**: The dynamic folder selection feature works but doesn't properly trigger Payload's save button or save the selected value to the database. This is due to limitations in how custom field components integrate with Payload's form state. Users need to make another change to the document after selecting a folder for the save button to activate.

2. **Function-based Folders**: Using functions to dynamically determine folders based on context (e.g., date-based or user-based folders) is documented but should be tested thoroughly with your specific use case.

See the [README](../README.md) for the most up-to-date information.
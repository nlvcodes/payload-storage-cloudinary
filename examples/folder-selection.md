# Cloudinary Folder Selection Examples

This plugin includes built-in dynamic folder selection that automatically fetches folders from your Cloudinary account.

## Basic Configuration

Enable dynamic folder selection in your collection:

```typescript
import { cloudinaryStorage } from 'payload-storage-cloudinary'

export default buildConfig({
  plugins: [
    cloudinaryStorage({
      cloudConfig: {
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
        api_key: process.env.CLOUDINARY_API_KEY!,
        api_secret: process.env.CLOUDINARY_API_SECRET!,
      },
      collections: {
        media: {
          enableDynamicFolders: true,
          useFolderSelect: true, // Enables the dynamic folder dropdown
          folder: 'uploads', // Default folder if none selected
        },
      },
    }),
  ],
})
```

## How It Works

When you enable `useFolderSelect`, the plugin:

1. **Adds a folder selection UI** with a radio toggle:
   - "Select existing folder" - Shows a dropdown with your Cloudinary folders
   - "Enter custom path" - Shows a text input for custom folder paths

2. **Fetches folders automatically** from your Cloudinary account:
   - Loads all folders when the form opens
   - Caches results for 5 minutes to reduce API calls
   - Falls back to common folders if the API is unavailable

3. **Handles folder creation** automatically:
   - If you type a new folder path, Cloudinary creates it on upload
   - No need to pre-create folders in Cloudinary

## User Experience

### Selecting a Folder
1. Open a media upload form
2. Choose "Select existing folder"
3. Pick from the dropdown of your Cloudinary folders
4. Upload your file - it goes to the selected folder

### Creating a New Folder
1. Open a media upload form
2. Choose "Enter custom path"
3. Type your desired folder path (e.g., `events/2024/summer`)
4. Upload your file - Cloudinary creates the folder automatically

## Configuration Options

```typescript
collections: {
  media: {
    // Enable the folder input fields
    enableDynamicFolders: true,
    
    // Enable the folder selection dropdown
    useFolderSelect: true,
    
    // Default folder (used if user doesn't select one)
    folder: 'uploads',
    
    // Custom field name for the folder input
    folderField: 'customFolder', // default: 'cloudinaryFolder'
  },
}
```

## API Endpoint

The plugin provides an API endpoint for folder data:

```
GET /api/{collection}/cloudinary/folders
```

Response:
```json
{
  "folders": [
    { "label": "/ (root)", "value": "" },
    { "label": "uploads", "value": "uploads" },
    { "label": "media/2024", "value": "media/2024" },
    { "label": "products/images", "value": "products/images" }
  ]
}
```

This endpoint is used internally by the folder select component and can also be used for custom integrations.

## Folder Organization Best Practices

### Recommended Structure
```
uploads/              # General uploads
├── media/           # Media assets
│   ├── 2024/       # Year-based organization
│   └── 2025/
├── products/        # Product images
│   ├── category-a/
│   └── category-b/
└── documents/       # PDFs and documents
```

### Naming Conventions
- Use lowercase: `products` not `Products`
- Use hyphens: `product-images` not `product_images`
- Be descriptive: `blog-posts/2024` not `bp/24`

## Troubleshooting

### Folders Not Loading?

1. **Check Cloudinary credentials** - Ensure they're correctly set in environment variables
2. **Check browser console** - Look for any API errors
3. **Verify API endpoint** - Test: `curl http://localhost:3000/api/media/cloudinary/folders`
4. **Check network tab** - See if the API call is being made

### Fallback Behavior

If the Cloudinary API is unavailable, the dropdown shows these default folders:
- / (root)
- uploads
- media  
- products
- documents

Your existing folder value is always preserved, even if it's not in the list.

## Advanced: Extending the Folder Selection

While the built-in component handles most use cases, you can extend it by:

1. **Using the API endpoint** in your own components
2. **Pre-fetching folders** at build time using the `getCloudinaryFolders` helper
3. **Creating custom validation** for folder names
4. **Adding folder permissions** based on user roles

```typescript
import { getCloudinaryFolders } from 'payload-storage-cloudinary'

// Pre-fetch folders at build time
const folders = await getCloudinaryFolders()
console.log('Available folders:', folders)
```
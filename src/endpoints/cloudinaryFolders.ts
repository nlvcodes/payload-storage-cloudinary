import type { PayloadHandler } from 'payload'
import { v2 as cloudinary } from 'cloudinary'

export const cloudinaryFoldersHandler: PayloadHandler = async () => {
  try {
    // Get credentials from environment variables
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME
    const apiKey = process.env.CLOUDINARY_API_KEY
    const apiSecret = process.env.CLOUDINARY_API_SECRET

    if (!cloudName || !apiKey || !apiSecret) {
      return Response.json(
        { error: 'Cloudinary credentials not configured on server' },
        { status: 500 }
      )
    }

    // Configure Cloudinary with server-side credentials
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
    })

    console.log('Cloudinary configured with cloud_name:', cloudName)

    // Try to get folders using different methods
    try {
      // First, try the Admin API folders endpoint
      console.log('Trying to fetch folders using Admin API...')
      
      try {
        const allFolders: any[] = []
        
        // Get root folders
        const rootResponse = await cloudinary.api.root_folders()
        console.log('Root folders response:', rootResponse)
        
        // Helper function to recursively get sub-folders
        const getSubFolders = async (folderPath: string, depth = 0) => {
          if (depth > 5) return // Prevent infinite recursion
          
          try {
            const subResponse = await cloudinary.api.sub_folders(folderPath)
            console.log(`Sub-folders of ${folderPath}:`, subResponse)
            
            if (subResponse.folders && subResponse.folders.length > 0) {
              for (const folder of subResponse.folders) {
                const fullPath = folder.path || `${folderPath}/${folder.name}`
                allFolders.push({
                  path: fullPath,
                  name: folder.name,
                  label: fullPath,
                  value: fullPath
                })
                // Recursively get sub-folders
                await getSubFolders(fullPath, depth + 1)
              }
            }
          } catch (err) {
            console.log(`Failed to get sub-folders of ${folderPath}:`, err)
          }
        }
        
        // Process root folders
        if (rootResponse.folders && rootResponse.folders.length > 0) {
          for (const folder of rootResponse.folders) {
            const folderPath = folder.path || folder.name
            allFolders.push({
              path: folderPath,
              name: folder.name,
              label: folderPath,
              value: folderPath
            })
            // Get sub-folders for each root folder
            await getSubFolders(folderPath)
          }
        }
        
        if (allFolders.length > 0) {
          console.log(`Found ${allFolders.length} total folders (including nested)`)
          return Response.json({ folders: allFolders }, { status: 200 })
        }
      } catch (adminError) {
        console.log('Admin API failed, trying search method:', adminError)
      }

      // Fallback to search method
      console.log('Using search API to find folders...')
      
      // Try multiple search approaches
      let result
      try {
        // First try searching for all resources
        result = await cloudinary.search
          .expression('resource_type:image OR resource_type:video OR resource_type:raw')
          .max_results(500)
          .execute()
        console.log('Search with resource types found:', result.total_count, 'resources')
      } catch (err) {
        console.log('Resource type search failed, trying folder:*')
        // Fallback to folder search
        result = await cloudinary.search
          .expression('folder:*')
          .max_results(500)
          .execute()
      }
      
      console.log('Search result:', result)

      // Extract unique folder paths from the results
      const folderSet = new Set<string>()
      
      if (result.resources && result.resources.length > 0) {
        console.log(`Found ${result.resources.length} resources`)
        result.resources.forEach((resource: any) => {
          if (resource.folder) {
            console.log(`Resource folder: ${resource.folder}`)
            // Add the folder and all parent folders
            const parts = resource.folder.split('/')
            for (let i = 1; i <= parts.length; i++) {
              const folderPath = parts.slice(0, i).join('/')
              folderSet.add(folderPath)
              console.log(`Added folder path: ${folderPath}`)
            }
          }
        })
      } else {
        console.log('No resources found in search result')
      }

      // Convert to array and sort
      const folders = Array.from(folderSet)
        .sort()
        .map(path => {
          // Format nested folders with indentation or path display
          const depth = path.split('/').length - 1
          const name = depth > 0 ? `${path}` : path || 'Root'
          return { 
            path, 
            name,
            label: name,
            value: path
          }
        })

      // If no folders found, try listing all resources
      if (folders.length === 0) {
        console.log('No folders found, trying to list all resources...')
        const allResources = await cloudinary.api.resources({ max_results: 500 })
        console.log('All resources:', allResources)
        
        // Extract folders from resources
        const resourceFolders = new Set<string>()
        if (allResources.resources) {
          allResources.resources.forEach((resource: any) => {
            if (resource.folder) {
              resourceFolders.add(resource.folder)
            }
          })
        }
        
        const extractedFolders = Array.from(resourceFolders)
          .sort()
          .map(path => ({ 
            path, 
            name: path,
            label: path || 'Root',
            value: path
          }))
          
        if (extractedFolders.length > 0) {
          return Response.json({ folders: extractedFolders }, { status: 200 })
        }
      }

      return Response.json({ folders }, { status: 200 })
    } catch (cloudinaryError: any) {
      console.error('Cloudinary API error:', cloudinaryError)
      
      // If search API fails, return some default folders
      return Response.json({
        folders: [
          { path: 'uploads', name: 'uploads' },
          { path: 'media', name: 'media' },
          { path: 'documents', name: 'documents' },
          { path: 'images', name: 'images' },
        ]
      }, { status: 200 })
    }
  } catch (error) {
    console.error('Error in cloudinaryFolders endpoint:', error)
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
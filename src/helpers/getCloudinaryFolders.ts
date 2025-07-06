import { v2 as cloudinary } from 'cloudinary'
import type { OptionObject } from 'payload'

// Cache for folder data
let cachedFolders: OptionObject[] | null = null
let cacheTimestamp: number = 0
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes in milliseconds

async function getAllCloudinaryFolders() {
  try {
    const result = await cloudinary.api.root_folders()
    return result.folders
  } catch (error) {
    console.error('Error fetching root folders:', error)
    throw error
  }
}

async function getSubfolders(folderPath: string) {
  try {
    const result = await cloudinary.api.sub_folders(folderPath)
    return result.folders
  } catch (error) {
    console.error(`Error fetching subfolders for ${folderPath}:`, error)
    throw error
  }
}

async function getAllFoldersRecursively(path: string = '', depth: number = 0): Promise<any[]> {
  const allFolders = []
  
  try {
    const folders = path === '' 
      ? await getAllCloudinaryFolders()
      : await getSubfolders(path)

    for (const folder of folders) {
      const indent = '  '.repeat(depth)
      const icon = depth > 0 ? '└─ ' : ''

      const displayName = depth > 0 ? folder.path : folder.name
      
      allFolders.push({
        label: `${indent}${icon}${displayName}`,
        value: folder.path,
      })

      const subfolders = await getAllFoldersRecursively(folder.path, depth + 1)
      allFolders.push(...subfolders)
    }
  } catch (error) {
    console.error(`Error fetching folders for path "${path}":`, error)
  }
  
  return allFolders
}

/**
 * Get all Cloudinary folders as options for a select field
 * @param useCache - Whether to use cached results (default: true)
 * @returns Array of folder options with label and value
 */
export async function getCloudinaryFolders(useCache: boolean = true): Promise<OptionObject[]> {
  const now = Date.now()
  
  // Check if cache is still valid
  if (useCache && cachedFolders && (now - cacheTimestamp) < CACHE_DURATION) {
    return cachedFolders
  }
  
  // Fetch fresh data
  const rootFolder = {
    label: '/ (root)',
    value: ''
  }
  
  try {
    const folders = [rootFolder, ...(await getAllFoldersRecursively())]
    
    // Update cache
    cachedFolders = folders
    cacheTimestamp = now
    
    return folders
  } catch (error) {
    console.error('Error fetching Cloudinary folders:', error)
    // Return minimal set if there's an error
    return [rootFolder]
  }
}
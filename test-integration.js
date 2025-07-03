import { cloudinaryStorage } from './dist/index.js'

// Test that the plugin can be instantiated
try {
  const plugin = cloudinaryStorage({
    cloudConfig: {
      cloud_name: 'test-cloud',
      api_key: 'test-key',
      api_secret: 'test-secret',
    },
    collections: {
      media: true,
      avatars: {
        folder: 'avatars',
        transformations: {
          quality: 'auto',
          format: 'auto',
        },
      },
    },
  })

  console.log('✅ Plugin instantiated successfully')
  
  // Test that it returns a function
  if (typeof plugin === 'function') {
    console.log('✅ Plugin returns a configuration function')
  } else {
    console.error('❌ Plugin does not return a function')
  }

  // Test with a mock config
  const mockConfig = {
    collections: [],
    plugins: [],
  }
  
  const result = plugin(mockConfig)
  
  if (result && typeof result === 'object') {
    console.log('✅ Plugin configuration applied successfully')
  } else {
    console.error('❌ Plugin configuration failed')
  }
  
} catch (error) {
  console.error('❌ Error:', error.message)
}
# Test Suite Documentation

This directory contains comprehensive tests for the Payload Cloudinary Storage plugin.

## Test Structure

```
__tests__/
├── setup.ts              # Test setup and global mocks
├── unit/                 # Unit tests for individual functions
│   ├── handlers/         # Upload, delete, URL generation handlers
│   ├── helpers/          # Transformation, signed URL helpers
│   ├── queue/           # Upload queue functionality
│   └── endpoints/       # API endpoint tests
├── integration/         # Integration tests
│   └── plugin.test.ts   # Plugin configuration and setup
└── e2e/                 # End-to-end scenarios
    └── upload-scenarios.test.ts
```

## Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test -- --watch

# Run tests with coverage
pnpm test:coverage

# Run specific test file
pnpm test src/__tests__/unit/handlers/handleUpload.test.ts

# Run tests matching pattern
pnpm test -- --grep "upload"
```

## Test Categories

### Unit Tests

Focus on testing individual functions and modules in isolation:

- **Handler Tests**: Test upload, delete, and URL generation logic
- **Helper Tests**: Test transformation strings, signed URL generation
- **Queue Tests**: Test upload queue management and chunked uploads
- **Endpoint Tests**: Test REST API endpoints for signed URLs

### Integration Tests

Test how different parts work together:

- Plugin initialization with various configurations
- Field creation based on configuration
- Endpoint registration for private files

### End-to-End Tests

Simulate real-world usage scenarios:

- Image uploads with transformations
- Video uploads with large file handling
- Document uploads with private access
- Dynamic folder selection
- Error handling and recovery

## Mocking Strategy

The test suite uses Vitest for mocking:

1. **Cloudinary SDK**: Fully mocked to avoid real API calls
2. **Payload Plugin**: Mocked to test plugin configuration
3. **File System**: Uses in-memory buffers instead of real files

## Key Test Utilities

### Mock Helpers

```typescript
// Create mock file
const file = mockFile({
  filename: 'test.jpg',
  mimeType: 'image/jpeg',
  filesize: 1024 * 1024, // 1MB
})

// Create mock Cloudinary response
const response = mockCloudinaryResponse({
  public_id: 'test-id',
  width: 1920,
  height: 1080,
})

// Create mock Payload request
const req = mockPayloadRequest({
  user: { id: 'user-123', role: 'admin' },
  routeParams: { id: 'doc-123' },
})
```

## Coverage Goals

- **Unit Tests**: 90%+ coverage of core functionality
- **Integration Tests**: All configuration combinations
- **E2E Tests**: Common user workflows and edge cases

## Adding New Tests

When adding new features:

1. Add unit tests for new functions/modules
2. Add integration tests for configuration changes
3. Add E2E tests for user-facing features
4. Update mock data if needed
5. Run coverage to ensure no gaps

## Common Test Patterns

### Testing Async Handlers

```typescript
it('should handle async operations', async () => {
  const handler = createUploadHandler(options)
  const result = await handler({ collection, file, data })
  expect(result).toMatchObject({ /* expected */ })
})
```

### Testing Error Cases

```typescript
it('should handle errors gracefully', async () => {
  vi.mocked(cloudinary.uploader.upload).mockRejectedValue(
    new Error('Network error')
  )
  
  await expect(handler(params)).rejects.toThrow('Network error')
})
```

### Testing with Different Configurations

```typescript
describe.each([
  { privateFiles: true },
  { privateFiles: { enabled: true, expiresIn: 7200 } },
])('with config %o', (config) => {
  it('should handle configuration', () => {
    // Test with each config variant
  })
})
```

## Debugging Tests

1. Use `--reporter=verbose` for detailed output
2. Add `console.log` statements (remove before commit)
3. Use `it.only()` to run single test
4. Check mock call arguments with `expect(mock).toHaveBeenCalledWith()`

## CI/CD Integration

Tests run automatically on:
- Pull requests
- Commits to main branch
- Before npm publish

Failed tests block deployment to ensure quality.
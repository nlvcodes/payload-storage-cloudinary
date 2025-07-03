# Package Instructions for payload-storage-cloudinary

## For Local Testing

To test this plugin in your own project before publishing to npm:

### Option 1: Using npm link (Recommended for development)

1. In this plugin directory:
```bash
pnpm build
npm link
```

2. In your Payload project:
```bash
npm link payload-storage-cloudinary
```

### Option 2: Using file path in package.json

In your Payload project's package.json:
```json
{
  "dependencies": {
    "payload-storage-cloudinary": "file:../path/to/payload-storage-cloudinary"
  }
}
```

Then run:
```bash
pnpm install
```

### Option 3: Using npm pack (Simulates npm install)

1. In this plugin directory:
```bash
pnpm build
npm pack
```

This creates `payload-storage-cloudinary-1.0.0.tgz`

2. In your Payload project:
```bash
npm install ../path/to/payload-storage-cloudinary-1.0.0.tgz
```

## Publishing to npm

When you're ready to publish:

1. Update the package.json with your details:
   - `author`: Your name
   - `repository.url`: Your GitHub repo URL
   - `bugs.url`: Your issues URL
   - `homepage`: Your README URL

2. Login to npm:
```bash
npm login
```

3. Publish:
```bash
npm publish
```

Or if you want to publish a beta version:
```bash
npm publish --tag beta
```

## Publishing to GitHub Packages

1. Update package.json name to include your scope:
```json
{
  "name": "@your-username/payload-storage-cloudinary"
}
```

2. Add to package.json:
```json
{
  "publishConfig": {
    "registry": "https://npm.pkg.github.com"
  }
}
```

3. Create a `.npmrc` file in your project:
```
@your-username:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

4. Publish:
```bash
NODE_AUTH_TOKEN=your-github-token npm publish
```

## What's Included

When published, the package includes:
- `dist/` - All compiled JavaScript and TypeScript definitions
- `README.md` - Main documentation
- `package.json` - Package metadata
- `LICENSE` - License file (if present)

The following are excluded (via .npmignore):
- Source files (`src/`)
- Development environment (`dev/`)
- Documentation files (`docs/`)
- Configuration files
- Test files

## Quick Test

After installing in your project:

```typescript
import { cloudinaryStorage } from 'payload-storage-cloudinary'

// Should work without errors
console.log(cloudinaryStorage)
```

## Troubleshooting

### Module Resolution Issues

If you get module resolution errors, ensure your project's tsconfig.json has:
```json
{
  "compilerOptions": {
    "moduleResolution": "node",
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true
  }
}
```

### React Version Conflicts

The plugin supports React 18 and 19. If you have conflicts:
```bash
npm install --force
# or
npm install --legacy-peer-deps
```
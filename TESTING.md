# Testing the Cloudinary Storage Plugin

## Setup

1. Create a Cloudinary account at https://cloudinary.com
2. Get your credentials from the Cloudinary dashboard
3. Create a `.env` file in the `dev` folder:

```bash
cd dev
cp .env.example .env
```

4. Fill in your Cloudinary credentials in the `.env` file

## Running the Test

1. Install dependencies:
```bash
cd dev
pnpm install
```

2. Start MongoDB (if not already running):
```bash
# Using Docker
docker run -d -p 27017:27017 mongo

# Or using local MongoDB
mongod
```

3. Start the Payload dev server:
```bash
pnpm dev
```

4. Open http://localhost:3000/admin
5. Create a new user account
6. Go to the Media collection
7. Upload an image
8. Verify the image appears in your Cloudinary dashboard

## What to Test

- [ ] File uploads successfully
- [ ] File appears in Cloudinary dashboard
- [ ] File URL is generated correctly
- [ ] File displays in Payload admin
- [ ] File can be deleted
- [ ] File is removed from Cloudinary when deleted

## Troubleshooting

- Check the console for any error messages
- Verify your Cloudinary credentials are correct
- Ensure MongoDB is running
- Check that the plugin is properly installed

## Live Smoke Test

The live smoke test checks the plugin's delivery URLs against a real Cloudinary cloud. Run it by hand before every release, and after any change to how the plugin builds, signs or renames assets. It never runs in CI.

It needs `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET` in the environment. With the credentials in `dev/.env` (Node 20.6 or later):

```bash
pnpm build
node --env-file=dev/.env scripts/live-smoke-test/index.mjs
```

With the variables already exported in your shell, `pnpm smoke:live` builds and runs it in one step. The script imports the plugin from `dist/`, so it checks the code that ships.

The script:

- uploads an `authenticated` asset and an `upload` asset into a new folder inside `payload-storage-cloudinary-smoke/` with Cloudinary's `folder` parameter, the way the plugin uploads, so the assets land in that folder in both fixed and dynamic folder mode, and touches nothing outside that folder;
- fails the upload check when Cloudinary returns another public ID than the planned one; the cleanup still destroys the planned ID, and the returned ID only when it is inside the run folder;
- checks that the signed original, the signed watermark preview, the signed blur preview and the eager URL return 200;
- checks that the unsigned `authenticated` URL and a tampered preview (the watermark removed, the signature kept) return 401;
- renames the `upload` asset to `authenticated` through the plugin's own `changeDeliveryType` (a rename with `to_type`) and checks that it keeps its public ID and version and that its signed URL returns 200;
- destroys every test asset with its delivery type and `invalidate: true`, even when a check fails.

Each check prints `PASS` or `FAIL`. Each asset it can't destroy prints `LEFT` with its public ID: delete it in the Media Library. The script exits non-zero when any check fails or any asset is left. It never prints a credential and writes no file.

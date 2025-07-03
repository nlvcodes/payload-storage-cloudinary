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
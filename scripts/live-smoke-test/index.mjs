/**
 * Live smoke test: proves the URL builder's output against a real Cloudinary cloud.
 *
 * Run by hand before a release, never in CI: `pnpm smoke:live`. It reads CLOUDINARY_CLOUD_NAME,
 * CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET from the environment, uploads its test assets under
 * a new folder inside `payload-storage-cloudinary-smoke/`, and destroys them before it exits.
 * It prints no credential and writes no file. The checks live in `run.mjs`.
 *
 * It imports the plugin from `dist/`, so it checks the code that ships: build first.
 */

import { v2 as cloudinary } from 'cloudinary'
import { buildDeliveryURL } from '../../dist/helpers/deliveryURL.js'
import { changeDeliveryType } from '../../dist/helpers/renameAsset.js'
import {
  buildBlurTransformation,
  buildWatermarkTransformation,
} from '../../dist/helpers/watermark.js'
import { redact, runSmokeTest, throwawayFolder } from './run.mjs'

const REQUIRED = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']
const missing = REQUIRED.filter((name) => !process.env[name])

if (missing.length > 0) {
  console.error(`Set ${missing.join(', ')} in the environment to run the live smoke test.`)
  process.exitCode = 1
} else {
  const secrets = [process.env.CLOUDINARY_API_KEY, process.env.CLOUDINARY_API_SECRET]
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  })

  const folder = throwawayFolder()
  console.log(`Live smoke test in ${folder}/`)

  // A first Ctrl-C stops the checks but lets the cleanup run; a second one exits at once.
  const stop = new AbortController()
  process.once('SIGINT', () => {
    console.log('Interrupted: destroying the test assets. Press Ctrl-C again to quit now.')
    stop.abort()
  })
  try {
    process.exitCode = await runSmokeTest({
      cloudinary,
      fetch,
      plugin: {
        buildDeliveryURL,
        buildWatermarkTransformation,
        buildBlurTransformation,
        changeDeliveryType,
      },
      folder,
      secrets,
      log: (line) => console.log(line),
      signal: stop.signal,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(redact(message, secrets))
    process.exitCode = 1
  }
  console.log(process.exitCode === 0 ? 'Every check passed.' : 'The smoke test failed.')
}

/**
 * The checks of the live smoke test, apart from the command line entry (`index.mjs`), so the unit
 * tests can run them against a fake cloud. Every dependency comes in as an argument: the Cloudinary
 * SDK, `fetch`, and the plugin's URL builder, its watermark and blur forms, and its rename.
 */

/** Every run uploads under its own folder inside this one. */
const SMOKE_ROOT = 'payload-storage-cloudinary-smoke'
const RUN_FOLDER = new RegExp(`^${SMOKE_ROOT}/[\\w-]+$`)

/** A folder no other run, and no real asset, uses. */
export function throwawayFolder() {
  const stamp = new Date().toISOString().replace(/[-:.]/g, '').replace('T', '-').replace('Z', '')
  return `${SMOKE_ROOT}/${stamp}-${Math.random().toString(36).slice(2, 8)}`
}

// One preset ahead of the watermark or blur, merged the way the afterRead hook merges them.
const PRESET = { width: 400, crop: 'limit' }
const EAGER = { width: 200, crop: 'scale' }

/**
 * Runs every check and returns the process exit code: 0 when every check passed, 1 otherwise.
 *
 * @param {object} deps
 * @param {any} deps.cloudinary The configured `v2` Cloudinary SDK.
 * @param {typeof fetch} deps.fetch
 * @param {{ buildDeliveryURL: Function, buildWatermarkTransformation: Function, buildBlurTransformation: Function, changeDeliveryType: Function }} deps.plugin
 * @param {string} deps.folder The throwaway folder. Every public ID the run touches starts with it.
 * @param {string[]} deps.secrets Values that never appear in the output.
 * @param {(line: string) => void} deps.log
 * @param {AbortSignal} [deps.signal] Once aborted, the remaining checks are skipped and the run
 *   goes straight to cleanup, so a Ctrl-C doesn't leave test assets behind.
 */
export async function runSmokeTest({ cloudinary, fetch, plugin, folder, secrets, log, signal }) {
  const print = (line) => log(redact(line, secrets))
  let failures = 0
  const pass = (name, detail) => print(`PASS ${name}${detail ? ` (${detail})` : ''}`)
  const fail = (name, detail) => {
    failures++
    print(`FAIL ${name}: ${detail}`)
  }

  // A check that throws fails on its own; the run goes on to the next one. A stopped run counts as
  // failed: it proved nothing about the checks it skipped.
  let stopped = false
  async function check(name, fn) {
    if (signal?.aborted) {
      if (!stopped) {
        failures++
        print('STOPPED: skipping the remaining checks to clean up')
      }
      stopped = true
      return
    }
    try {
      await fn()
    } catch (error) {
      fail(name, error instanceof Error ? error.message : String(error))
    }
  }

  async function expectStatus(name, url, expected) {
    const response = await fetch(url)
    await response.arrayBuffer()
    if (response.status === expected) pass(name, response.status)
    else fail(name, `expected ${expected}, got ${response.status}`)
  }
  const checkStatus = (name, url, expected) => check(name, () => expectStatus(name, url, expected))

  if (!RUN_FOLDER.test(folder)) {
    fail('throwaway folder', `"${folder}" is not a folder of its own under ${SMOKE_ROOT}/`)
    return 1
  }

  // Every asset the run may create, known before any upload, so the cleanup also reaches an asset
  // Cloudinary stored when the upload response was lost (a timeout, a reset, a 5xx after commit).
  const planned = (name, type) => ({ name, publicId: `${folder}/${name}`, type })
  const plan = {
    authenticated: planned('authenticated', 'authenticated'),
    upload: planned('upload', 'upload'),
  }

  // The `folder` parameter, the way the plugin uploads: in dynamic folder mode a slash in
  // `public_id` names no folder, while `folder` sets the folder and the public ID prefix in both.
  async function upload(record, options = {}) {
    record.requested = true
    const result = await cloudinary.uploader.upload(solidBitmapDataURI(), {
      folder,
      public_id: record.name,
      type: record.type,
      resource_type: 'image',
      ...options,
    })
    record.returned = true
    record.type = result.type
    if (result.public_id !== record.publicId) {
      record.returnedId = result.public_id
      throw new Error(
        `Cloudinary returned the public ID ${result.public_id}, not ${record.publicId}`,
      )
    }
    return result
  }
  const assetOf = (result) => ({
    publicId: result.public_id,
    version: result.version,
    resourceType: result.resource_type,
    format: result.format,
    deliveryType: result.type,
  })

  try {
    let original
    await check('upload an authenticated asset', async () => {
      original = await upload(plan.authenticated, { eager: [EAGER] })
    })
    if (original) {
      const asset = assetOf(original)
      const signedOriginal = plugin.buildDeliveryURL(asset)
      await checkStatus('signed original', signedOriginal, 200)
      await checkStatus('unsigned authenticated URL', withoutSignature(signedOriginal), 401)

      const watermark = [PRESET, ...plugin.buildWatermarkTransformation({}, 'SMOKE TEST')]
      const watermarked = plugin.buildDeliveryURL(asset, { transformation: watermark })
      await checkStatus('signed watermark preview', watermarked, 200)
      const blur = [PRESET, plugin.buildBlurTransformation()]
      await checkStatus(
        'signed blur preview',
        plugin.buildDeliveryURL(asset, { transformation: blur }),
        200,
      )
      // Drop the watermark and keep the signature, the way a reader would strip it from a preview.
      const stripped = plugin.buildDeliveryURL(asset, { transformation: [PRESET] })
      await checkStatus('tampered preview', withSignatureOf(watermarked, stripped), 401)

      // The builder's URL for the eager derivative, not the one Cloudinary returned, so the check
      // proves the builder.
      const eager = plugin.buildDeliveryURL(asset, { transformation: [EAGER] })
      await checkStatus('eager URL', eager, 200)
    }

    let publicAsset
    await check('upload an upload asset', async () => {
      publicAsset = await upload(plan.upload)
    })
    if (publicAsset) {
      // Through the plugin's own operation, so the run proves the rename that ships.
      await check('rename with to_type', async () => {
        const asset = assetOf(publicAsset)
        const renamed = await plugin.changeDeliveryType(asset, 'authenticated')
        plan.upload.type = renamed.deliveryType
        if (
          renamed.publicId !== asset.publicId ||
          renamed.version !== asset.version ||
          renamed.deliveryType !== 'authenticated'
        ) {
          throw new Error('the public ID or version changed, or the type is not authenticated')
        }
        await expectStatus('rename with to_type', plugin.buildDeliveryURL(renamed), 200)
      })
    }
  } finally {
    const left = (publicId, type, problem) => {
      failures++
      print(`LEFT ${publicId} (${type}): ${problem}`)
    }
    for (const record of Object.values(plan)) {
      if (!record.requested) continue
      const { returnedId } = record
      const problems = await destroy(cloudinary, record.publicId, record.type)
      // An upload that never answered, or answered with another public ID, and is found under
      // neither type was most likely never stored under the planned one.
      const maybeNeverStored = !record.returned || returnedId !== undefined
      const notFound = problems.every((problem) => problem === 'not found')
      if (problems.length > 0 && !(maybeNeverStored && notFound)) {
        left(record.publicId, record.type, problems[0])
      }

      if (returnedId === undefined) continue
      // The run destroys nothing outside its own folder, whatever Cloudinary answered.
      if (!returnedId.startsWith(`${folder}/`)) {
        left(returnedId, record.type, 'outside the run folder, so the run did not destroy it')
        continue
      }
      const strayProblems = await destroy(cloudinary, returnedId, record.type)
      if (strayProblems.length > 0) left(returnedId, record.type, strayProblems[0])
    }
  }

  return failures === 0 ? 0 : 1
}

/**
 * Destroys a test asset under its recorded type, then under the other type when Cloudinary doesn't
 * find it: a rename can change the type and still report an error. Returns what went wrong on each
 * attempt, or an empty list when the asset is gone.
 */
async function destroy(cloudinary, publicId, type) {
  const other = type === 'authenticated' ? 'upload' : 'authenticated'
  const problems = []
  for (const attempt of [type, other]) {
    try {
      const { result } = await cloudinary.uploader.destroy(publicId, {
        type: attempt,
        resource_type: 'image',
        invalidate: true,
      })
      if (result === 'ok') return []
      problems.push(result)
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error))
    }
  }
  return problems
}

/** `line` with every secret in it replaced by `[redacted]`. */
export function redact(line, secrets) {
  return secrets
    .filter(Boolean)
    .reduce((text, secret) => text.split(secret).join('[redacted]'), String(line))
}

const SIGNATURE = /\/s--[\w-]{8}--\//

function withoutSignature(url) {
  return url.replace(SIGNATURE, '/')
}

// `target` with the signature of `signed` in place of its own.
function withSignatureOf(signed, target) {
  return target.replace(SIGNATURE, SIGNATURE.exec(signed)[0])
}

// A 16 x 16 grey bitmap: small, valid, and built here so the run needs no fixture file.
const BITMAP_SIZE = 16

function solidBitmapDataURI() {
  const size = BITMAP_SIZE
  const rowBytes = size * 3
  const pixelBytes = rowBytes * size
  const file = Buffer.alloc(54 + pixelBytes, 0x80)
  file.write('BM', 0, 'ascii')
  file.writeUInt32LE(file.length, 2)
  file.writeUInt32LE(0, 6)
  file.writeUInt32LE(54, 10)
  file.writeUInt32LE(40, 14)
  file.writeInt32LE(size, 18)
  file.writeInt32LE(size, 22)
  file.writeUInt16LE(1, 26)
  file.writeUInt16LE(24, 28)
  file.writeUInt32LE(0, 30)
  file.writeUInt32LE(pixelBytes, 34)
  file.writeInt32LE(2835, 38)
  file.writeInt32LE(2835, 42)
  file.writeUInt32LE(0, 46)
  file.writeUInt32LE(0, 50)
  return `data:image/bmp;base64,${file.toString('base64')}`
}

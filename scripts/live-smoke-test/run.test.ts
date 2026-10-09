import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { runSmokeTest } from './run.mjs'

// A fake Cloudinary cloud: an asset store behind the upload API, and a CDN in front of it that
// answers like the real one did on 2026-10-01. An `authenticated` asset needs a signature that
// matches the delivered path; an `upload` asset needs none.

const CLOUD = 'res.cloudinary.com/test-cloud/image'
const FOLDER = 'payload-storage-cloudinary-smoke/run-1'
const SECRETS = { api_key: '123456789012345', api_secret: 'shh-very-secret-value' }

type DeliveryType = 'upload' | 'authenticated'
interface Asset {
  publicId: string
  version?: number
  format?: string
  deliveryType: DeliveryType
}

const encode = (transformation: unknown) =>
  transformation === undefined ? '' : `${encodeURIComponent(JSON.stringify(transformation))}/`
const fakeSign = (path: string) =>
  `s--${createHash('sha1').update(path).digest('base64url').slice(0, 8)}--/`

// Stand-ins for the plugin's URL builder and its watermark and blur forms.
const plugin = {
  buildDeliveryURL(asset: Asset, options: { transformation?: unknown } = {}) {
    const path = `${encode(options.transformation)}v${asset.version}/${asset.publicId}.${asset.format}`
    const signature = asset.deliveryType === 'authenticated' ? fakeSign(path) : ''
    return `https://${CLOUD}/${asset.deliveryType}/${signature}${path}`
  },
  buildWatermarkTransformation: (_config: unknown, text?: string) => [
    { crop: 'scale', width: 800 },
    { overlay: { text }, flags: ['layer_apply', 'tiled'] },
  ],
  buildBlurTransformation: () => ({ effect: 'blur:2000', crop: 'limit' }),
}

function fakeCloud() {
  const assets = new Map<string, { type: DeliveryType; version: number; format: string }>()
  const calls: { method: string; publicId: string; options: Record<string, any> }[] = []
  let nextVersion = 1700000000

  const cloudinary = {
    uploader: {
      async upload(_file: string, options: Record<string, any>) {
        // Like Cloudinary in either folder mode, the `folder` parameter prefixes the public ID.
        const publicId = options.folder
          ? `${options.folder}/${options.public_id}`
          : options.public_id
        calls.push({ method: 'upload', publicId, options })
        const type: DeliveryType = options.type ?? 'upload'
        const asset = { type, version: nextVersion++, format: 'bmp' }
        assets.set(publicId, asset)
        const deliver = (transformation?: unknown) =>
          plugin.buildDeliveryURL({ publicId, ...asset, deliveryType: type }, { transformation })
        return {
          public_id: publicId,
          version: asset.version,
          format: asset.format,
          resource_type: 'image',
          type,
          api_key: SECRETS.api_key,
          secure_url: deliver(),
          eager: (options.eager ?? []).map((t: unknown) => ({ secure_url: deliver([t]) })),
        }
      },
      async rename(from: string, to: string, options: Record<string, any>) {
        calls.push({ method: 'rename', publicId: from, options: { ...options, to } })
        const asset = assets.get(from)
        if (!asset || asset.type !== (options.type ?? 'upload'))
          throw new Error('Resource not found')
        assets.delete(from)
        asset.type = options.to_type ?? asset.type
        assets.set(to, asset)
        return { public_id: to, version: asset.version, type: asset.type, format: asset.format }
      },
      async destroy(publicId: string, options: Record<string, any>) {
        calls.push({ method: 'destroy', publicId, options })
        const asset = assets.get(publicId)
        if (!asset || asset.type !== (options.type ?? 'upload')) return { result: 'not found' }
        assets.delete(publicId)
        return { result: 'ok' }
      },
    },
  }

  // The plugin's `changeDeliveryType` against this cloud. It looks `rename` up at call time, so a
  // test that swaps the cloud's rename also swaps what the plugin calls.
  const cloudPlugin = {
    ...plugin,
    async changeDeliveryType(asset: Asset & { resourceType?: string }, deliveryType: DeliveryType) {
      const result = await cloudinary.uploader.rename(asset.publicId, asset.publicId, {
        resource_type: asset.resourceType || 'image',
        type: asset.deliveryType,
        to_type: deliveryType,
        overwrite: false,
        invalidate: true,
      })
      return {
        publicId: result.public_id,
        version: result.version ?? asset.version,
        resourceType: asset.resourceType,
        format: result.format ?? asset.format,
        deliveryType: result.type ?? deliveryType,
      }
    },
  }

  async function fetch(url: string) {
    const match = new RegExp(
      `^https://${CLOUD}/(upload|authenticated)/(s--[\\w-]{8}--/)?(.*v(\\d+)/(.+)\\.(\\w+))$`,
    ).exec(url)
    const status = (() => {
      if (!match) return 404
      const [, type, signature, path, , publicId] = match
      const asset = assets.get(publicId)
      if (!asset || asset.type !== type) return 404
      if (type === 'authenticated' && signature !== fakeSign(path)) return 401
      return 200
    })()
    return new Response(status === 200 ? 'image' : null, { status })
  }

  return { assets, calls, cloudinary, fetch, plugin: cloudPlugin }
}

function run(cloud = fakeCloud(), overrides: Record<string, any> = {}) {
  const lines: string[] = []
  const exitCode = runSmokeTest({
    cloudinary: cloud.cloudinary,
    fetch: cloud.fetch,
    plugin: cloud.plugin,
    folder: FOLDER,
    secrets: Object.values(SECRETS),
    log: (line: string) => lines.push(line),
    ...overrides,
  })
  return { exitCode, lines, output: () => lines.join('\n') }
}

describe('runSmokeTest', () => {
  it('passes every check against a cloud that behaves like Cloudinary', async () => {
    const cloud = fakeCloud()
    const { exitCode, output } = run(cloud)

    expect(await exitCode).toBe(0)
    for (const check of [
      'signed original',
      'unsigned authenticated URL',
      'signed watermark preview',
      'signed blur preview',
      'tampered preview',
      'eager URL',
      'rename with to_type',
    ]) {
      expect(output()).toMatch(new RegExp(`^PASS ${check}`, 'm'))
    }
    expect(output()).not.toMatch(/^FAIL/m)
    expect(cloud.assets.size).toBe(0)
  })

  it('checks the eager derivative through the URL builder, not the returned URL', async () => {
    const cloud = fakeCloud()
    const returnedEager: string[] = []
    const upload = cloud.cloudinary.uploader.upload
    cloud.cloudinary.uploader.upload = async (file, options) => {
      const result = await upload(file, options)
      // Eager URLs the fake CDN rejects with a 401: their signature is gone.
      const eager = result.eager.map(({ secure_url }: { secure_url: string }) => ({
        secure_url: secure_url.replace(/\/s--[\w-]{8}--\//, '/'),
      }))
      returnedEager.push(...eager.map(({ secure_url }: { secure_url: string }) => secure_url))
      return { ...result, eager }
    }
    const fetched: string[] = []
    const fetch = (url: string) => {
      fetched.push(url)
      return cloud.fetch(url)
    }
    const { exitCode, output } = run(cloud, { fetch })

    expect(await exitCode).toBe(0)
    expect(output()).toMatch(/^PASS eager URL \(200\)$/m)
    const authenticated = cloud.calls.find((call) => call.method === 'upload')!
    expect(fetched).toContain(
      plugin.buildDeliveryURL(
        {
          publicId: authenticated.publicId,
          version: 1700000000,
          format: 'bmp',
          deliveryType: 'authenticated',
        },
        { transformation: authenticated.options.eager },
      ),
    )
    expect(returnedEager).toHaveLength(1)
    expect(fetched).not.toContain(returnedEager[0])
  })

  it('exits non-zero and names the check when the CDN serves an authenticated asset unsigned', async () => {
    const cloud = fakeCloud()
    const fetch = async (url: string) => {
      const response = await cloud.fetch(url)
      return response.status === 401 ? new Response('image', { status: 200 }) : response
    }
    const { exitCode, output } = run(cloud, { fetch })

    expect(await exitCode).toBe(1)
    expect(output()).toMatch(/^FAIL unsigned authenticated URL: expected 401, got 200$/m)
    expect(output()).toMatch(/^FAIL tampered preview: expected 401, got 200$/m)
    expect(output()).toMatch(/^PASS signed original/m)
  })

  it('destroys every test asset with its type and invalidate when a check throws', async () => {
    const cloud = fakeCloud()
    const fetch = async () => {
      throw new Error('getaddrinfo ENOTFOUND res.cloudinary.com')
    }
    const { exitCode, output } = run(cloud, { fetch })

    expect(await exitCode).toBe(1)
    expect(output()).toMatch(/ENOTFOUND/)
    expect(cloud.calls.filter((call) => call.method === 'destroy')).toEqual([
      {
        method: 'destroy',
        publicId: `${FOLDER}/authenticated`,
        options: { type: 'authenticated', resource_type: 'image', invalidate: true },
      },
      {
        method: 'destroy',
        publicId: `${FOLDER}/upload`,
        options: { type: 'authenticated', resource_type: 'image', invalidate: true },
      },
    ])
    expect(cloud.assets.size).toBe(0)
  })

  it('destroys the renamed asset with the type it has after the rename', async () => {
    const cloud = fakeCloud()
    const { exitCode } = run(cloud)

    expect(await exitCode).toBe(0)
    expect(cloud.calls.filter((call) => call.method === 'destroy')).toContainEqual({
      method: 'destroy',
      publicId: `${FOLDER}/upload`,
      options: { type: 'authenticated', resource_type: 'image', invalidate: true },
    })
  })

  it("renames through the plugin's changeDeliveryType and fetches the renamed signed URL", async () => {
    const cloud = fakeCloud()
    const fetched: string[] = []
    const fetch = (url: string) => {
      fetched.push(url)
      return cloud.fetch(url)
    }
    const { exitCode, output } = run(cloud, { fetch })

    expect(await exitCode).toBe(0)
    expect(output()).toMatch(/^PASS rename with to_type \(200\)$/m)
    expect(cloud.calls.filter((call) => call.method === 'rename')).toEqual([
      {
        method: 'rename',
        publicId: `${FOLDER}/upload`,
        options: {
          resource_type: 'image',
          type: 'upload',
          to_type: 'authenticated',
          overwrite: false,
          invalidate: true,
          to: `${FOLDER}/upload`,
        },
      },
    ])
    const upload = cloud.calls.find(
      (call) => call.method === 'upload' && call.options.type === 'upload',
    )!
    expect(fetched).toContain(
      plugin.buildDeliveryURL({
        publicId: upload.publicId,
        version: 1700000001,
        format: 'bmp',
        deliveryType: 'authenticated',
      }),
    )
  })

  it('destroys the public asset as an upload asset when the rename fails', async () => {
    const cloud = fakeCloud()
    cloud.cloudinary.uploader.rename = async () => {
      throw new Error('Rate Limit Exceeded')
    }
    const { exitCode, output } = run(cloud)

    expect(await exitCode).toBe(1)
    expect(output()).toMatch(/^FAIL rename with to_type: Rate Limit Exceeded$/m)
    expect(cloud.calls.filter((call) => call.method === 'destroy')).toContainEqual({
      method: 'destroy',
      publicId: `${FOLDER}/upload`,
      options: { type: 'upload', resource_type: 'image', invalidate: true },
    })
    expect(cloud.assets.size).toBe(0)
  })

  it('reports each asset it could not destroy and exits non-zero', async () => {
    const cloud = fakeCloud()
    const destroy = cloud.cloudinary.uploader.destroy
    cloud.cloudinary.uploader.destroy = async (publicId, options) => {
      if (publicId.endsWith('/authenticated')) throw new Error('Server Error')
      return destroy(publicId, options)
    }
    const { exitCode, output } = run(cloud)

    expect(await exitCode).toBe(1)
    expect(output()).toMatch(
      new RegExp(`^LEFT ${FOLDER}/authenticated \\(authenticated\\): Server Error$`, 'm'),
    )
    expect(output()).not.toMatch(new RegExp(`^LEFT ${FOLDER}/upload`, 'm'))
  })

  it('destroys an asset Cloudinary stored when the upload response never arrived', async () => {
    const cloud = fakeCloud()
    const upload = cloud.cloudinary.uploader.upload
    cloud.cloudinary.uploader.upload = async (file, options) => {
      await upload(file, options)
      throw new Error('socket hang up')
    }
    const { exitCode, output } = run(cloud)

    expect(await exitCode).toBe(1)
    expect(cloud.calls.filter((call) => call.method === 'destroy')).toContainEqual({
      method: 'destroy',
      publicId: `${FOLDER}/authenticated`,
      options: { type: 'authenticated', resource_type: 'image', invalidate: true },
    })
    expect(cloud.assets.size).toBe(0)
    expect(output()).not.toMatch(/^LEFT/m)
  })

  it('reports no leftover for an upload that failed before anything was stored', async () => {
    const cloud = fakeCloud()
    cloud.cloudinary.uploader.upload = async () => {
      throw new Error('ECONNRESET')
    }
    const { exitCode, output } = run(cloud)

    expect(await exitCode).toBe(1)
    expect(output()).toMatch(/^FAIL upload an authenticated asset: ECONNRESET$/m)
    expect(output()).not.toMatch(/^LEFT/m)
  })

  it('still reports an asset whose upload returned but that is gone under both types', async () => {
    const cloud = fakeCloud()
    cloud.cloudinary.uploader.destroy = async () => ({ result: 'not found' })
    const { exitCode, output } = run(cloud)

    expect(await exitCode).toBe(1)
    expect(output()).toMatch(
      new RegExp(`^LEFT ${FOLDER}/authenticated \\(authenticated\\): not found$`, 'm'),
    )
  })

  it('skips the remaining checks and still cleans up when the run is stopped', async () => {
    const cloud = fakeCloud()
    const stop = new AbortController()
    const upload = cloud.cloudinary.uploader.upload
    cloud.cloudinary.uploader.upload = async (file, options) => {
      const result = await upload(file, options)
      stop.abort()
      return result
    }
    const { exitCode, output } = run(cloud, { signal: stop.signal })

    expect(await exitCode).toBe(1)
    expect(output()).toMatch(/^STOPPED/m)
    expect(output()).not.toMatch(/^(PASS|FAIL) signed original/m)
    expect(cloud.calls.map((call) => call.method)).toEqual(['upload', 'destroy'])
    expect(cloud.assets.size).toBe(0)
  })

  it('destroys an asset under its other type when the rename changed it but reported an error', async () => {
    const cloud = fakeCloud()
    const rename = cloud.cloudinary.uploader.rename
    cloud.cloudinary.uploader.rename = async (from, to, options) => {
      await rename(from, to, options)
      throw new Error('socket hang up')
    }
    const { exitCode, output } = run(cloud)

    expect(await exitCode).toBe(1)
    expect(output()).not.toMatch(/^LEFT/m)
    expect(cloud.assets.size).toBe(0)
  })

  // In dynamic folder mode a slash in `public_id` names no folder; `folder` works in both modes.
  it('uploads into its run folder with the folder parameter and a public ID without a slash', async () => {
    const cloud = fakeCloud()
    await run(cloud).exitCode

    const uploads = cloud.calls.filter((call) => call.method === 'upload')
    expect(uploads).toHaveLength(2)
    for (const { options } of uploads) {
      expect(options.folder).toBe(FOLDER)
      expect(options.public_id).toMatch(/^[^/]+$/)
    }
  })

  it('fails the upload and destroys both IDs when Cloudinary stores it under another one', async () => {
    const cloud = fakeCloud()
    const upload = cloud.cloudinary.uploader.upload
    // A cloud that appends a suffix, the way `unique_filename` does.
    cloud.cloudinary.uploader.upload = (file, options) =>
      upload(file, { ...options, public_id: `${options.public_id}_x7k2p` })
    const { exitCode, output } = run(cloud)

    expect(await exitCode).toBe(1)
    expect(output()).toMatch(
      new RegExp(
        `^FAIL upload an authenticated asset: Cloudinary returned the public ID ` +
          `${FOLDER}/authenticated_x7k2p, not ${FOLDER}/authenticated$`,
        'm',
      ),
    )
    const destroyed = cloud.calls.filter((call) => call.method === 'destroy')
    for (const publicId of [`${FOLDER}/authenticated`, `${FOLDER}/authenticated_x7k2p`]) {
      expect(destroyed.map((call) => call.publicId)).toContain(publicId)
    }
    expect(cloud.assets.size).toBe(0)
    expect(output()).not.toMatch(/^LEFT/m)
  })

  it('leaves a returned public ID outside its run folder alone and reports it', async () => {
    const cloud = fakeCloud()
    const upload = cloud.cloudinary.uploader.upload
    cloud.cloudinary.uploader.upload = (file, options) =>
      upload(file, { ...options, folder: 'elsewhere' })
    const { exitCode, output } = run(cloud)

    expect(await exitCode).toBe(1)
    expect(output()).toMatch(/^FAIL upload an authenticated asset: Cloudinary returned/m)
    const destroyed = cloud.calls.filter((call) => call.method === 'destroy')
    expect(destroyed.map((call) => call.publicId)).toContain(`${FOLDER}/authenticated`)
    expect(destroyed.every((call) => call.publicId.startsWith(`${FOLDER}/`))).toBe(true)
    expect(cloud.assets.has('elsewhere/authenticated')).toBe(true)
    expect(output()).toMatch(/^LEFT elsewhere\/authenticated \(authenticated\): /m)
  })

  it('touches only public IDs inside its throwaway folder', async () => {
    const cloud = fakeCloud()
    await run(cloud).exitCode

    expect(cloud.calls.length).toBeGreaterThan(0)
    for (const call of cloud.calls) {
      expect(call.publicId).toMatch(new RegExp(`^${FOLDER}/[^/]+$`))
    }
    const renames = cloud.calls.filter((call) => call.method === 'rename')
    expect(renames.map((call) => call.options.to)).toEqual([`${FOLDER}/upload`])
  })

  it.each(['', '/', 'payload-storage-cloudinary-smoke', 'payload-storage-cloudinary-smoke/'])(
    'refuses to run in the folder %j, which is not a throwaway run folder',
    async (folder) => {
      const cloud = fakeCloud()
      const { exitCode, output } = run(cloud, { folder })

      expect(await exitCode).toBe(1)
      expect(output()).toMatch(/^FAIL throwaway folder/m)
      expect(cloud.calls).toEqual([])
    },
  )

  it('redacts the API key and secret from every line, even in an error from the SDK', async () => {
    const cloud = fakeCloud()
    cloud.cloudinary.uploader.upload = async () => {
      throw new Error(
        `Invalid Signature for api_key ${SECRETS.api_key}: String to sign - 'timestamp=1&${SECRETS.api_secret}'`,
      )
    }
    const { exitCode, output } = run(cloud)

    expect(await exitCode).toBe(1)
    expect(output()).toMatch(/\[redacted\]/)
    for (const secret of Object.values(SECRETS)) expect(output()).not.toContain(secret)
  })
})

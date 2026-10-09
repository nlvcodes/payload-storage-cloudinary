import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { sqliteAdapter, type SQLiteAdapterArgs } from '@payloadcms/db-sqlite'
import {
  buildConfig,
  createLocalReq,
  getPayload,
  handleEndpoints,
  type CollectionConfig,
  type Config,
  type Payload,
  type PayloadRequest,
  type SanitizedConfig,
} from 'payload'
import { cloudinaryStorage } from '../../../index'
import type { CloudinaryStorageOptions } from '../../../types'
import { mockCloudinaryApi, type CloudinaryApiMock } from './cloudinaryApi'

export type { CloudinaryCall } from './cloudinaryApi'

const FORCE_PUSH = 'PAYLOAD_FORCE_DRIZZLE_PUSH'

export const TEST_CLOUD = {
  cloud_name: 'test-cloud',
  api_key: 'test-key',
  api_secret: 'test-secret',
}

const users: CollectionConfig = {
  slug: 'users',
  auth: true,
  fields: [],
}

// An upload collection with Payload's default access: any logged-in user, nobody else.
const media: CollectionConfig = {
  slug: 'media',
  upload: true,
  fields: [{ name: 'alt', type: 'text' }],
}

export type StartOptions = {
  /** Collections beside `users`. Defaults to the `media` upload collection. */
  collections?: CollectionConfig[]
  /** The plugin's `collections` option. Defaults to `media` with `privateFiles: true`. */
  pluginCollections?: CloudinaryStorageOptions['collections']
  /** Turns on SQLite transactions, as a site that sets `transactionOptions` has. Off by default. */
  transactionOptions?: SQLiteAdapterArgs['transactionOptions']
  /** Payload's `localization` option. Off by default. */
  localization?: Config['localization']
}

export type TestUser = { id: number | string; email: string; token: string }

export type TestRequestInit = RequestInit & {
  /** Send the request as this user. Omit it for an anonymous request. */
  user?: TestUser
}

export type PayloadHarness = {
  payload: Payload
  config: SanitizedConfig
  cloudinary: Pick<CloudinaryApiMock, 'calls' | 'failOn'>
  /** Creates a user in the `users` collection and logs it in. */
  createUser: () => Promise<TestUser>
  /** Returns a test user as Payload puts it on `req.user` for a logged-in request. */
  userOf: (user: TestUser) => Promise<NonNullable<PayloadRequest['user']>>
  /** Sends a fetch Request through Payload's REST router and returns the Response. */
  request: (urlPath: string, init?: TestRequestInit) => Promise<Response>
  stop: () => Promise<void>
}

/**
 * Boots a real Payload instance with the plugin installed, on a fresh SQLite file.
 * Only the Cloudinary network calls are mocked. Call once per test file, and call `stop` afterwards.
 */
export async function startPayload(options: StartOptions = {}): Promise<PayloadHarness> {
  const dir = await mkdtemp(path.join(tmpdir(), 'payload-storage-cloudinary-'))
  // Drizzle skips the schema push when the schema equals the last one pushed in this process.
  // Every boot gets an empty SQLite file, so it always needs the push.
  const forcePushBefore = process.env[FORCE_PUSH]
  process.env[FORCE_PUSH] = 'true'
  const cloudinaryMock = mockCloudinaryApi()

  // The first call tears down. Later calls get the same promise and do nothing more.
  let stopping: Promise<void> | undefined
  const stop = (payload?: Payload) =>
    (stopping ??= stopPayload({ payload, cloudinaryMock, dir, forcePushBefore }))

  try {
    const config = await buildConfig({
      secret: 'payload-storage-cloudinary-test-secret',
      telemetry: false,
      // Payload otherwise spawns `generate:types` on every boot, and with the relative
      // `rootDir` in tsconfig.json that child process never exits.
      typescript: { autoGenerate: false },
      logger: { options: { level: 'silent' } },
      db: sqliteAdapter({
        client: { url: `file:${path.join(dir, 'payload.db')}` },
        transactionOptions: options.transactionOptions,
      }),
      collections: [users, ...(options.collections ?? [media])],
      localization: options.localization,
      plugins: [
        cloudinaryStorage({
          cloudConfig: TEST_CLOUD,
          collections: options.pluginCollections ?? { media: { privateFiles: true } },
        }),
      ],
    })
    const payload = await getPayload({ config })

    let userCount = 0
    const createUser = async (): Promise<TestUser> => {
      userCount += 1
      const email = `user-${userCount}@example.com`
      const password = 'test-password'
      // Seeding is a trusted server job, so it skips access on purpose.
      const req = await createLocalReq({}, payload)
      await payload.create({
        collection: 'users',
        data: { email, password },
        req,
        overrideAccess: true,
      })
      const { token, user } = await payload.login({
        collection: 'users',
        data: { email, password },
        req,
      })
      if (!token) throw new Error(`Login returned no token for ${email}`)
      return { id: user.id, email, token }
    }

    const userOf = async (user: TestUser): Promise<NonNullable<PayloadRequest['user']>> => {
      // Reading a fixture is a trusted test step, so it skips access on purpose.
      const doc = await payload.findByID({
        collection: 'users',
        id: user.id,
        req: await createLocalReq({}, payload),
        overrideAccess: true,
      })
      return { ...doc, collection: 'users' } as NonNullable<PayloadRequest['user']>
    }

    const request = async (urlPath: string, init: TestRequestInit = {}) => {
      const { user, ...rest } = init
      const url = new URL(urlPath, 'http://localhost:3000')
      // The draft serializes the body and sets Content-Type, multipart boundary included.
      const draft = new Request(url, rest)
      const headers = new Headers(draft.headers)
      if (user) headers.set('Authorization', `JWT ${user.token}`)

      // An HTTP server sets Content-Length, and Payload parses a multipart body only when it is set.
      let body: ArrayBuffer | undefined
      if (draft.body) {
        body = await draft.arrayBuffer()
        headers.set('Content-Length', String(body.byteLength))
      }

      return handleEndpoints({
        config,
        request: new Request(url, { method: draft.method, headers, body }),
      })
    }

    return {
      payload,
      config,
      cloudinary: { calls: cloudinaryMock.calls, failOn: cloudinaryMock.failOn },
      createUser,
      userOf,
      request,
      stop: () => stop(payload),
    }
  } catch (error) {
    // Boot failed, so there is no Payload instance to destroy.
    await stop()
    throw error
  }
}

async function stopPayload({
  payload,
  cloudinaryMock,
  dir,
  forcePushBefore,
}: {
  payload: Payload | undefined
  cloudinaryMock: CloudinaryApiMock
  dir: string
  forcePushBefore: string | undefined
}) {
  await payload?.destroy()
  // getPayload caches one instance per process. Clear it so the next boot gets a fresh one.
  const cached = (globalThis as any)._payload
  if (cached) {
    cached.payload = null
    cached.promise = null
  }
  cloudinaryMock.restore()
  if (forcePushBefore === undefined) delete process.env[FORCE_PUSH]
  else process.env[FORCE_PUSH] = forcePushBefore
  await rm(dir, { recursive: true, force: true })
}

// A 1x1 transparent PNG.
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

/** A multipart body that uploads a PNG with the given document data. */
export function pngUpload(filename: string, data: Record<string, unknown> = {}): FormData {
  const form = new FormData()
  form.append('file', new File([PNG_BYTES], filename, { type: 'image/png' }))
  form.append('_payload', JSON.stringify(data))
  return form
}

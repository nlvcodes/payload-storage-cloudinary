import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { pngUpload, startPayload, TEST_CLOUD, type PayloadHarness, type TestUser } from './harness'

const BASE = `https://res.cloudinary.com/${TEST_CLOUD.cloud_name}/image`
const pathOf = (url: string) => url.split('?')[0]

// The public ID of another private file, which a caller must never get into a signed URL.
const VICTIM = 'victim'

describe('signed-URL endpoints sign only allowed transformations', () => {
  let harness: PayloadHarness
  let user: TestUser
  let doc: { id: number; cloudinaryPublicId: string }
  let version: number

  beforeAll(async () => {
    harness = await startPayload()
    user = await harness.createUser()

    const res = await harness.request('/api/media', {
      method: 'POST',
      body: pngUpload('transform.png'),
      user,
    })
    expect(res.status).toBe(201)
    doc = (await res.json()).doc
    const call = harness.cloudinary.calls.find(
      (c) => c.method === 'upload_stream' && c.result.public_id === doc.cloudinaryPublicId,
    )
    version = call!.result.version as number
  })

  afterAll(async () => {
    await harness?.stop()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  /** The single endpoint with `transformations` sent as given, already URL-encoded. */
  const single = (encoded: string) =>
    harness.request(`/api/media/signed-url/${doc.id}?transformations=${encoded}`, { user })

  const asJSON = (value: unknown) => single(encodeURIComponent(JSON.stringify(value)))
  const asCommaList = (value: string) => single(encodeURIComponent(value))

  const batch = (body: Record<string, unknown>) =>
    harness.request('/api/media/signed-urls', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      user,
    })

  const expectRefused = async (res: Response) => {
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBeTruthy()
    expect(body).not.toHaveProperty('url')
    expect(body).not.toHaveProperty('results')
    expect(JSON.stringify(body)).not.toContain('res.cloudinary.com')
  }

  const signedPath = (transformation: string) =>
    new RegExp(
      `^${BASE}/authenticated/s--[\\w-]{8}--/${transformation}/v${version}/${doc.cloudinaryPublicId}\\.png$`,
    )

  describe('a key outside the allowlist returns 400 and no URL', () => {
    // Each key can name another asset, chain a component, or reach a variable or named transformation.
    const refusedKeys: Record<string, unknown> = {
      overlay: VICTIM,
      underlay: VICTIM,
      raw_transformation: `l_${VICTIM}`,
      transformation: 'named_preset',
      default_image: VICTIM,
      variables: [['$v', VICTIM]],
      $v: VICTIM,
      if: 'w_gt_100',
      effect: 'grayscale',
      flags: 'attachment',
      prefix: VICTIM,
      custom_function: VICTIM,
    }

    for (const [key, value] of Object.entries(refusedKeys)) {
      it(`refuses ${key} in the JSON form, single endpoint`, async () => {
        await expectRefused(await asJSON({ width: 300, [key]: value }))
      })

      it(`refuses ${key} on the batch endpoint`, async () => {
        await expectRefused(
          await batch({ ids: [String(doc.id)], transformations: { [key]: value } }),
        )
      })
    }

    for (const pair of [`overlay:${VICTIM}`, `underlay:${VICTIM}`, 'transformation:named_preset']) {
      it(`refuses ${pair} in the comma-separated form`, async () => {
        await expectRefused(await asCommaList(`width:300,${pair}`))
      })
    }

    it('refuses a key outside the allowlist in the bracket form', async () => {
      const res = await harness.request(
        `/api/media/signed-url/${doc.id}?transformations[width]=300&transformations[overlay]=${VICTIM}`,
        { user },
      )
      await expectRefused(res)
    })

    it('refuses transformations that are not an object of keys', async () => {
      await expectRefused(await asJSON(`l_${VICTIM}`))
      await expectRefused(await asJSON([{ overlay: VICTIM }]))
      await expectRefused(await asJSON(300))
      await expectRefused(await batch({ ids: [String(doc.id)], transformations: `l_${VICTIM}` }))
      await expectRefused(await batch({ ids: [String(doc.id)], transformations: [{ width: 300 }] }))
    })
  })

  describe('a value that could add a segment or a component returns 400', () => {
    const refusedValues: Record<string, unknown>[] = [
      { crop: `fill/l_${VICTIM}` },
      { crop: `fill,l_${VICTIM}` },
      { gravity: 'auto:faces' },
      { quality: `l_authenticated:${VICTIM}` },
      { width: '$w' },
      { width: '300 ' },
      { crop: 'fill\nl_victim' },
      { width: [300, 400] },
      { width: { overlay: VICTIM } },
      { width: true },
      { crop: 'x'.repeat(100) },
    ]

    for (const value of refusedValues) {
      it(`refuses ${JSON.stringify(value)} on both endpoints`, async () => {
        await expectRefused(await asJSON(value))
        await expectRefused(await batch({ ids: [String(doc.id)], transformations: value }))
      })
    }

    for (const list of [`crop:fill/l_${VICTIM}`, 'gravity:auto:faces', 'width:$w', 'width:300,']) {
      it(`refuses ${list} in the comma-separated form`, async () => {
        await expectRefused(await asCommaList(list))
      })
    }
  })

  describe('an allowed transformation returns a signed authenticated URL that carries it', () => {
    const allowed = {
      width: 300,
      height: 200,
      crop: 'fill',
      gravity: 'auto',
      quality: 'auto',
      fetch_format: 'auto',
      dpr: 2,
      aspect_ratio: 1.5,
    }
    const component = 'ar_1.5,c_fill,dpr_2,f_auto,g_auto,h_200,q_auto,w_300'

    it('signs it in the JSON form', async () => {
      const res = await asJSON(allowed)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(pathOf(body.url)).toMatch(signedPath(component))
      expect(body.transformations).toEqual(allowed)
    })

    it('signs it in the comma-separated form', async () => {
      const res = await asCommaList('width:300,height:200,crop:fill')
      expect(res.status).toBe(200)
      expect(pathOf((await res.json()).url)).toMatch(signedPath('c_fill,h_200,w_300'))
    })

    it('signs it in the bracket form', async () => {
      const res = await harness.request(
        `/api/media/signed-url/${doc.id}?transformations[width]=300&transformations[crop]=fill`,
        { user },
      )
      expect(res.status).toBe(200)
      expect(pathOf((await res.json()).url)).toMatch(signedPath('c_fill,w_300'))
    })

    it('signs it on the batch endpoint', async () => {
      const res = await batch({ ids: [String(doc.id)], transformations: allowed })
      expect(res.status).toBe(200)
      const [result] = (await res.json()).results
      expect(pathOf(result.url)).toMatch(signedPath(component))
    })
  })

  describe('the batch endpoint caps the number of IDs', () => {
    const MAX_IDS = 100
    // IDs no document has, so a lookup would find nothing and still answer 200.
    const missingIDs = (count: number) => Array.from({ length: count }, (_, i) => String(9000 + i))

    /** Records the queries that reach the database adapter for the `media` collection. */
    const watchMediaQueries = () => {
      const db = harness.payload.db
      const spies = (['find', 'findOne', 'count', 'queryDrafts'] as const).map((method) =>
        vi.spyOn(db, method),
      )
      return () =>
        spies.flatMap((spy) => spy.mock.calls).filter(([args]) => args?.collection === 'media')
    }

    it('returns 400 above the cap and runs no database query for the collection', async () => {
      const mediaQueries = watchMediaQueries()

      await expectRefused(await batch({ ids: missingIDs(MAX_IDS + 1) }))
      expect(mediaQueries()).toHaveLength(0)
    })

    it('answers each ID at the cap', async () => {
      const mediaQueries = watchMediaQueries()

      const res = await batch({ ids: [...missingIDs(MAX_IDS - 1), String(doc.id)] })
      expect(res.status).toBe(200)
      const { results } = await res.json()
      expect(results).toHaveLength(MAX_IDS)
      expect(results[MAX_IDS - 1].url).toBeTruthy()
      // The watch sees the lookup, so its silence above the cap means no query ran.
      expect(mediaQueries().length).toBeGreaterThan(0)
    })
  })
})

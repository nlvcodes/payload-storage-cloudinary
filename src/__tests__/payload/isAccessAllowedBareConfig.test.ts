import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'

// The warning is logged once per process, so each test loads a fresh copy of the module.
const loadIsAccessAllowed = async () => {
  vi.resetModules()
  return (await import('../../helpers/signedURLs')).isAccessAllowed
}

const req = { user: { id: 1 } }
const doc = { id: 1, hasPublicTransformation: true }

const warningsThatSay = (warn: MockInstance, text: string) =>
  warn.mock.calls.filter(([message]) => String(message).includes(text))

// The 1.2.x shape's own warning, apart from the one every doc-taking call logs
const deprecationWarnings = (warn: MockInstance) => warningsThatSay(warn, 'bare SignedURLConfig')
// The doc-taking form's warning, which points at the form that decides like the plugin
const docFormWarnings = (warn: MockInstance) => warningsThatSay(warn, 'isAccessAllowedByID')

describe('isAccessAllowed with the 1.2.x call shape', () => {
  let warn: MockInstance

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warn.mockRestore()
  })

  it('refuses a bare SignedURLConfig with no customAuthCheck, and warns once', async () => {
    const isAccessAllowed = await loadIsAccessAllowed()

    expect(await isAccessAllowed(req, doc, { enabled: true })).toBe(false)
    expect(await isAccessAllowed(req, doc, { enabled: true, expiresIn: 60 })).toBe(false)

    expect(deprecationWarnings(warn)).toHaveLength(1)
  })

  it('refuses a call with no config, and warns once', async () => {
    const isAccessAllowed = await loadIsAccessAllowed()

    expect(await isAccessAllowed(req, doc)).toBe(false)
    expect(await isAccessAllowed(req, doc, undefined)).toBe(false)

    expect(deprecationWarnings(warn)).toHaveLength(1)
  })

  it("returns a bare SignedURLConfig's customAuthCheck answer", async () => {
    const isAccessAllowed = await loadIsAccessAllowed()

    expect(await isAccessAllowed(req, doc, { enabled: true, customAuthCheck: () => true })).toBe(
      true,
    )
    expect(
      await isAccessAllowed(req, doc, { enabled: true, customAuthCheck: async () => false }),
    ).toBe(false)

    expect(deprecationWarnings(warn)).toHaveLength(1)
  })

  it("decides as before on the collection's plugin config, with no 1.2.x warning", async () => {
    const isAccessAllowed = await loadIsAccessAllowed()
    const publicTransformation = {
      default: { quality: 'auto' },
      publicTransformation: { enabled: true },
    }

    // `media: true` installs the collection with `{}`
    expect(await isAccessAllowed(req, doc, {})).toBe(true)
    expect(await isAccessAllowed(req, doc, { privateFiles: true })).toBe(true)
    expect(
      await isAccessAllowed(req, doc, {
        privateFiles: true,
        transformations: publicTransformation,
      }),
    ).toBe(false)
    expect(
      await isAccessAllowed(req, doc, {
        privateFiles: { enabled: true, customAuthCheck: () => true },
        transformations: publicTransformation,
      }),
    ).toBe(true)
    expect(
      await isAccessAllowed(req, doc, {
        signedURLs: { enabled: true, customAuthCheck: () => false },
      }),
    ).toBe(false)

    expect(deprecationWarnings(warn)).toHaveLength(0)
  })

  it('warns once that the doc-taking form is deprecated, whatever config it gets', async () => {
    const isAccessAllowed = await loadIsAccessAllowed()

    await isAccessAllowed(req, doc, { privateFiles: true })
    await isAccessAllowed(req, doc, {})
    await isAccessAllowed(req, doc, { enabled: true })
    await isAccessAllowed(req, doc)

    expect(docFormWarnings(warn)).toHaveLength(1)
  })
})

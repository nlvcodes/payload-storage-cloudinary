import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createPremiumImageComponent,
  createPrivateImageComponent,
  fetchSignedURL,
  fetchSignedURLs,
  getImageURL,
} from '../../../helpers/clientHelpers'

const THUMBNAIL = 'https://res.cloudinary.com/test-cloud/image/upload/c_fill,h_150,w_150/v1/a.png'
const STORED = 'https://res.cloudinary.com/test-cloud/image/authenticated/s--stored1--/v1/a.png'
const PREVIEW =
  'https://res.cloudinary.com/test-cloud/image/authenticated/s--preview--/l_text/v1/a.png'

// Just enough React to render a component once, outside a browser.
const React = {
  useState: (initial: unknown) => [initial, () => {}],
  useEffect: () => {},
  createElement: (type: string, props: Record<string, unknown> | null, children?: unknown) => ({
    type,
    props: { ...props, children },
  }),
}

// Every `src` in a rendered element tree.
const sources = (node: any): string[] => {
  if (!node || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(sources)
  return [...(node.props?.src ? [node.props.src] : []), ...sources(node.props?.children)]
}

const components = {
  PrivateImage: createPrivateImageComponent(React),
  PremiumImage: createPremiumImageComponent(React),
}

describe.each(Object.entries(components))('%s', (_name, Component) => {
  it('shows a private file without a preview with no thumbnail', () => {
    const doc = { id: '1', isPrivate: true, thumbnailURL: THUMBNAIL, cloudinaryUrl: STORED }

    expect(sources(Component({ doc, collection: 'media' }))).toEqual([])
  })

  it('shows the preview of a private file', () => {
    const doc = { id: '1', isPrivate: true, thumbnailURL: THUMBNAIL, previewUrl: PREVIEW }

    expect(sources(Component({ doc, collection: 'media' }))).toEqual([PREVIEW])
  })

  it('never shows the stored Cloudinary URL of a public file', () => {
    const doc = { id: '1', cloudinaryUrl: STORED }

    expect(sources(Component({ doc, collection: 'media' }))).not.toContain(STORED)
  })
})

describe('getImageURL', () => {
  it('never returns the stored Cloudinary URL of a public file', async () => {
    expect(await getImageURL({ id: '1', cloudinaryUrl: STORED }, 'media')).toBe('')
  })
})

describe.each([
  ['fetchSignedURL', () => fetchSignedURL('media', '1')],
  ['fetchSignedURLs', () => fetchSignedURLs('media', ['1'])],
])('%s', (_name, call) => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('throws the reason the endpoint gives for a refused request', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ error: 'Transformation key "overlay" is not allowed' }, { status: 400 }),
      ),
    )

    await expect(call()).rejects.toThrow('Transformation key "overlay" is not allowed')
  })
})

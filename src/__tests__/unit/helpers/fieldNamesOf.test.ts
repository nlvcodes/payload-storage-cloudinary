import { describe, expect, it } from 'vitest'
import { fieldNamesOf } from '../../../helpers/normalizeConfig'

describe('fieldNamesOf', () => {
  it('names each field after its default when the config names none', () => {
    expect(fieldNamesOf({})).toEqual({
      transformationPreset: 'transformationPreset',
      hasPublicTransformation: 'hasPublicTransformation',
      transformationType: 'transformationType',
      watermarkText: 'watermarkText',
    })
  })

  it('takes the names the config sets', () => {
    expect(
      fieldNamesOf({
        presetFieldName: 'look',
        publicTransformation: {
          enabled: true,
          fieldName: 'showPreview',
          typeFieldName: 'previewKind',
          watermark: { textFieldName: 'stamp' },
        },
      }),
    ).toEqual({
      transformationPreset: 'look',
      hasPublicTransformation: 'showPreview',
      transformationType: 'previewKind',
      watermarkText: 'stamp',
    })
  })

  it('falls back to the default for an empty name, as a missing one', () => {
    expect(
      fieldNamesOf({ presetFieldName: '', publicTransformation: { fieldName: '' } }),
    ).toMatchObject({
      transformationPreset: 'transformationPreset',
      hasPublicTransformation: 'hasPublicTransformation',
    })
  })
})

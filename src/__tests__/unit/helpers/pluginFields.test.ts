import { describe, expect, it } from 'vitest'
import { PLUGIN_FIELDS, pluginFieldNames, pluginFieldOf } from '../../../helpers/pluginFields'

const namesWhere = (test: (field: (typeof PLUGIN_FIELDS)[number]) => boolean) =>
  PLUGIN_FIELDS.filter(test)
    .map((field) => field.name)
    .sort()

describe('the plugin field list', () => {
  it('names each field once', () => {
    const names = PLUGIN_FIELDS.map((field) => field.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('marks every field the plugin writes itself, and only those', () => {
    expect(namesWhere((field) => field.writtenByPlugin === true)).toEqual(
      [
        'cloudinaryPublicId',
        'cloudinaryUrl',
        'cloudinaryResourceType',
        'cloudinaryFormat',
        'cloudinaryVersion',
        'cloudinaryType',
        'originalUrl',
        'transformedUrl',
        'filesize',
        'requiresSignedURL',
        'publicTransformationUrl',
        'publicTransformationPublicId',
        'previewUrl',
      ].sort(),
    )
  })

  it('hides the two stored delivery URLs from every response', () => {
    expect(namesWhere((field) => field.hiddenFromReads === true)).toEqual(
      ['cloudinaryUrl', 'originalUrl'].sort(),
    )
  })

  it('leaves isPrivate to the editor', () => {
    expect(pluginFieldOf('isPrivate')?.writtenByPlugin).toBeUndefined()
  })

  it('finds no field for a name it does not list', () => {
    expect(pluginFieldOf('alt')).toBeUndefined()
    expect(pluginFieldOf('constructor')).toBeUndefined()
  })
})

describe('pluginFieldNames', () => {
  it('lists the fields the read hooks need on every Cloudinary collection', () => {
    expect(pluginFieldNames('readHooksNeed', false).sort()).toEqual(
      [
        'cloudinaryPublicId',
        'cloudinaryType',
        'cloudinaryVersion',
        'cloudinaryResourceType',
        'cloudinaryFormat',
        'cloudinaryUrl',
        'originalUrl',
      ].sort(),
    )
  })

  it('adds the privacy fields on a privateFiles collection', () => {
    expect(pluginFieldNames('readHooksNeed', true).sort()).toEqual(
      [...pluginFieldNames('readHooksNeed', false), 'isPrivate', 'requiresSignedURL'].sort(),
    )
  })

  it('lists the fields a projected document must carry to be decided on', () => {
    expect(pluginFieldNames('decisionNeeds', false)).toEqual(['cloudinaryPublicId'])
    expect(pluginFieldNames('decisionNeeds', true).sort()).toEqual(
      ['cloudinaryPublicId', 'cloudinaryType', 'isPrivate'].sort(),
    )
  })
})

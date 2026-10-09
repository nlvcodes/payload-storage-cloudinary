/**
 * The fields the plugin adds under a fixed name, and Payload's own upload URL fields, which the
 * plugin sets at read time, with what each one is for. The field access in index.ts and the
 * afterRead hook's lists derive from this one, so a new field changes one place. The fields a
 * collection names itself are in fieldNamesOf (normalizeConfig.ts).
 */

/** Whether a role applies on every Cloudinary collection, or only on a `privateFiles` one. */
type Applies = 'always' | 'privateFiles'

export interface PluginField {
  name: string
  /**
   * Field access drops a caller's value on an access-enforced create or update, so only the
   * plugin's own code writes it.
   */
  writtenByPlugin?: true
  /** Field access hides the stored value from every response. */
  hiddenFromReads?: true
  /** The read hooks need it, so `forceSelect` adds it to every read that selects fields. */
  readHooksNeed?: Applies
  /** A projected document that lacks it can't be decided on, so the read gets no URL. */
  decisionNeeds?: Applies
  /**
   * What a read that fails closed does with it: `remove` deletes it from the document, and
   * `null` sets it to null, when any condition in `withheldWhen` holds, or always without one.
   */
  withheld?: 'remove' | 'null'
  /** `privateFiles`: on a privateFiles collection. `present`: when the document carries it. */
  withheldWhen?: ReadonlyArray<'privateFiles' | 'present'>
}

export const PLUGIN_FIELDS: readonly PluginField[] = [
  // Payload's own upload fields
  { name: 'url', withheld: 'null' },
  { name: 'thumbnailURL', withheld: 'null' },
  // The asset
  {
    name: 'cloudinaryPublicId',
    writtenByPlugin: true,
    readHooksNeed: 'always',
    decisionNeeds: 'always',
  },
  { name: 'cloudinaryResourceType', writtenByPlugin: true, readHooksNeed: 'always' },
  { name: 'cloudinaryFormat', writtenByPlugin: true, readHooksNeed: 'always' },
  { name: 'cloudinaryVersion', writtenByPlugin: true, readHooksNeed: 'always' },
  {
    name: 'cloudinaryType',
    writtenByPlugin: true,
    readHooksNeed: 'always',
    decisionNeeds: 'privateFiles',
  },
  // A stored delivery URL is a permanent link, so no response returns these two. A legacy
  // record's type lives in them. The afterRead hook sets originalUrl again for a public file.
  {
    name: 'cloudinaryUrl',
    writtenByPlugin: true,
    hiddenFromReads: true,
    readHooksNeed: 'always',
    withheld: 'remove',
  },
  {
    name: 'originalUrl',
    writtenByPlugin: true,
    hiddenFromReads: true,
    readHooksNeed: 'always',
    withheld: 'remove',
  },
  {
    name: 'transformedUrl',
    writtenByPlugin: true,
    withheld: 'null',
    withheldWhen: ['privateFiles', 'present'],
  },
  { name: 'filesize', writtenByPlugin: true },
  // Privacy
  { name: 'isPrivate', readHooksNeed: 'privateFiles', decisionNeeds: 'privateFiles' },
  { name: 'requiresSignedURL', writtenByPlugin: true, readHooksNeed: 'privateFiles' },
  // Preview
  { name: 'previewUrl', writtenByPlugin: true, withheld: 'null', withheldWhen: ['privateFiles'] },
  {
    name: 'publicTransformationUrl',
    writtenByPlugin: true,
    withheld: 'null',
    withheldWhen: ['present'],
  },
  { name: 'publicTransformationPublicId', writtenByPlugin: true },
]

/** The listed field with this name, or undefined when the list doesn't name it. */
export function pluginFieldOf(name: string): PluginField | undefined {
  return PLUGIN_FIELDS.find((field) => field.name === name)
}

/** The names of the fields a role applies to, on a collection with or without `privateFiles`. */
export function pluginFieldNames(
  role: 'readHooksNeed' | 'decisionNeeds',
  privateFiles: boolean,
): string[] {
  return PLUGIN_FIELDS.filter(
    (field) => field[role] === 'always' || (privateFiles && field[role] === 'privateFiles'),
  ).map((field) => field.name)
}

'use client'

import type { TextFieldClientProps } from 'payload'

import { FieldLabel, useField } from '@payloadcms/ui'
import React from 'react'

export const SimpleFolderField: React.FC<TextFieldClientProps> = ({ field, path }) => {
  const { value, setValue } = useField<string>({ path })
  
  return (
    <div>
      <FieldLabel
        label={field.label}
        required={field.required}
      />
      <input
        type="text"
        value={value || ''}
        onChange={(e) => setValue(e.target.value)}
        placeholder={(field.admin as any)?.placeholder || ''}
        style={{
          width: '100%',
          padding: '0.5rem',
          border: '1px solid var(--color-base-400)',
          borderRadius: '0.25rem',
          fontSize: 'var(--font-size-base)',
        }}
      />
      <p style={{ marginTop: '0.5rem', fontSize: 'var(--font-size-small)' }}>
        Value: {value || '(empty)'} | Path: {path}
      </p>
    </div>
  )
}
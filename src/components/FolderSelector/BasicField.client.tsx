'use client'

import type { TextFieldClientProps } from 'payload'

import { FieldLabel, TextInput } from '@payloadcms/ui'
import React from 'react'

export const BasicFolderField = (props: TextFieldClientProps) => {
  console.log('BasicFolderField props:', props)
  
  const { field, path } = props
  
  return (
    <div>
      <FieldLabel
        label={field.label}
        required={field.required}
      />
      <TextInput
        path={path}
      />
      <p>This is a basic field test</p>
    </div>
  )
}
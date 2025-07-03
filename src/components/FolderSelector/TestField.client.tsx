'use client'

import type { TextFieldClientProps } from 'payload'
import React from 'react'

export const TestField: React.FC<TextFieldClientProps> = (props) => {
  console.log('TestField mounted with props:', props)
  
  // Don't use useField at all - just render a simple input
  const [localValue, setLocalValue] = React.useState('')
  
  return (
    <div style={{ border: '2px solid red', padding: '1rem', marginBottom: '1rem' }}>
      <h3>Test Field Component</h3>
      <p>Field name: {props.field?.name}</p>
      <p>Path: {props.path}</p>
      <input
        type="text"
        value={localValue}
        onChange={(e) => {
          console.log('Input changed:', e.target.value)
          setLocalValue(e.target.value)
        }}
        style={{ width: '100%', padding: '0.5rem' }}
        placeholder="Type here to test"
      />
      <p>Local value: {localValue}</p>
      <details>
        <summary>All props (click to expand)</summary>
        <pre>{JSON.stringify(props, null, 2)}</pre>
      </details>
    </div>
  )
}
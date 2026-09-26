import { createElement, type ReactNode } from 'react'
import NextLink from 'next/link'
import { createNode } from '@meonode/ui'

function ServerButton(props: { children?: ReactNode; className?: string }) {
  return createElement('button', props)
}

function ServerInput(props: { className?: string }) {
  return createElement('input', { ...props, readOnly: true, value: 'slotted' })
}

/** A server function component rendering a `<button>`: its host is created by React, not by meonode. */
export const Button = createNode(ServerButton)

/** A server function component rendering a void `<input>`, which can hold no children. */
export const Input = createNode(ServerInput)

/** `next/link`, whose server-side export is a function component wrapping the client link. */
export const Link = createNode(NextLink)

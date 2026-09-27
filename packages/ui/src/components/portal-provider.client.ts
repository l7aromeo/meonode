'use client'
import { createContext, type ReactNode, useState, useRef, useCallback, useMemo } from 'react'
import type { Children, PortalContextValue, PortalStackEntry, PortalHandle, PortalLayerComponent } from '@src/types/node.type.js'
import { Node } from '@src/core.node.js'
import { createDataChannel } from '@src/helper/data-channel.helper.js'

/**
 * The portal stack, held outside React state so that opening or closing a layer
 * never changes the provider's context value.
 *
 * A layer opened while the page is still hydrating — from a mount effect, say —
 * would otherwise change the context every Suspense boundary below the provider
 * sits under, and React discards the server HTML of any such boundary that has
 * not hydrated yet and client-renders it. Only `PortalHost` renders the stack,
 * so only it subscribes.
 */
export interface PortalContextState extends PortalContextValue {
  subscribe: (listener: () => void) => () => void
  getStack: () => PortalStackEntry[]
}

export const PortalContext = createContext<PortalContextState | null>(null)

const EMPTY_STACK: PortalStackEntry[] = []

/**
 * Provides portal context to the component tree.
 * Manages the portal stack and exposes methods for opening/closing portals.
 * Must wrap any components that use `usePortal()` or `PortalHost`.
 * @param children The children to render.
 * @returns The rendered component tree with portal context.
 */
export default function PortalProvider({ children }: { children?: Children }): ReactNode {
  const [store] = useState(() => {
    let stack = EMPTY_STACK
    const listeners = new Set<() => void>()
    return {
      getStack: () => stack,
      subscribe(listener: () => void) {
        listeners.add(listener)
        return () => void listeners.delete(listener)
      },
      update(next: (previous: PortalStackEntry[]) => PortalStackEntry[]) {
        stack = next(stack)
        listeners.forEach(listener => listener())
      },
    }
  })
  const idCounter = useRef(0)

  const showPortal = useCallback(
    <T>(Component: PortalLayerComponent<T>, initialData?: T): PortalHandle<T> => {
      const id = ++idCounter.current
      const channel = createDataChannel<T>(initialData)

      store.update(prev => [...prev, { id, Component: Component as PortalLayerComponent, channel }])

      return {
        id,
        updateData: (next: T) => channel.set(next),
        close: () => store.update(prev => prev.filter(l => l.id !== id)),
      }
    },
    [store],
  )

  const value = useMemo<PortalContextState>(
    () => ({
      // Read when asked, so the value itself never has to change with it.
      get stack() {
        return store.getStack()
      },
      getStack: store.getStack,
      subscribe: store.subscribe,
      showPortal,
      hidePortal: () => store.update(prev => prev.slice(0, -1)),
      hidePortalById: (id: number) => store.update(prev => prev.filter(l => l.id !== id)),
      hideAll: () => store.update(() => EMPTY_STACK),
    }),
    [store, showPortal],
  )

  return Node(PortalContext.Provider, { value, children }).render()
}

;(PortalProvider as { __meonodeAcceptsServerCss?: boolean }).__meonodeAcceptsServerCss = true

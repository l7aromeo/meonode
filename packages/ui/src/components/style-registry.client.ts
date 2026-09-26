'use client'
import { createElement, type ReactElement, useContext, useState } from 'react'
import { CacheProvider } from '@emotion/react'
import createCache from '@emotion/cache'
import { Node } from '@src/core.node.js'
import { ServerInsertedHTMLContext, useServerInsertedHTML } from 'next/navigation.js'

/**
 * What has already been flushed, per render.
 *
 * Keyed on the `ServerInsertedHTMLContext` value, because that is the one thing
 * both client passes of a Cache Components prerender share. Next creates one
 * inserted-HTML list per prerender and renders the client tree under it twice —
 * a prospective pass and the final one — so two `StyleRegistry` instances each
 * register a flush callback, each with an emotion cache holding the whole page.
 * A set held per instance cannot see across that, and would ship every rule twice.
 *
 * The context value is also distinct per render, so concurrent requests never
 * share a set; and a `WeakMap` lets each one go when its render does. The
 * second pass's callback still emits anything the first lacked, so the union of
 * what both passes rendered reaches the page — a dedupe must not drop a rule the
 * page needs to avoid shipping one twice.
 */
const flushedByRender = new WeakMap<object, Set<string>>()

/**
 * Style registry for Emotion to support SSR/streaming in Next.js App Router.
 *
 * - Creates a single Emotion cache instance in compat mode.
 * - Uses `useServerInsertedHTML` to inline critical CSS collected during render.
 * @param children React subtree that consumes Emotion styles.
 * @returns React element that provides the cache and injects critical CSS during SSR.
 */
export default function StyleRegistry({ children }: { children: ReactElement }) {
  // One cache per registry instance, so each render — each request, on the
  // server — collects into its own. The flush below reads all of
  // `cache.inserted`, so a cache shared across requests would put every style
  // the process has rendered into every response. Compat mode keeps each rule's
  // text there for the flush.
  const [cache] = useState(() => {
    const emotionCache = createCache({ key: 'meonode-css' })
    emotionCache.compat = true
    return emotionCache
  })

  // Which ids this render has already flushed. Shared with any other pass of the
  // same render through the context value; falls back to one set per instance
  // outside Next, where there is no second pass to share with.
  const insertedHTML = useContext(ServerInsertedHTMLContext) as object | null
  const [ownInserted] = useState(() => new Set<string>())
  let inserted = ownInserted
  if (insertedHTML) {
    let shared = flushedByRender.get(insertedHTML)
    if (!shared) flushedByRender.set(insertedHTML, (shared = new Set<string>()))
    inserted = shared
  }

  // During server rendering, collect styles inserted into the cache and inline them in the HTML.
  useServerInsertedHTML(() => {
    const ids = Object.keys(cache.inserted)
    const newIds = ids.filter(id => !inserted.has(id) && typeof cache.inserted[id] === 'string')
    // Theme variables are emitted by ThemeProvider itself (a hoisted, deduped
    // `<style href precedence>`), not consumed from global state here.
    if (newIds.length === 0) {
      return null
    }

    // Mark IDs as inserted
    newIds.forEach(id => inserted.add(id))

    // Ensure deterministic output by sorting ids.
    const sortedIds = [...newIds].sort()
    const styles = sortedIds.map(id => cache.inserted[id] as string).join('')
    const idsString = sortedIds.join(' ')

    // Insert a single style tag with the tracked Emotion ids.
    return createElement('style', {
      'data-emotion': `${cache.key} ${idsString}`,
      dangerouslySetInnerHTML: { __html: styles },
    })
  })

  // Provide the Emotion cache to descendants.
  return Node(CacheProvider, { value: cache, children }).render()
}

;(StyleRegistry as { __meonodeAcceptsServerCss?: boolean }).__meonodeAcceptsServerCss = true

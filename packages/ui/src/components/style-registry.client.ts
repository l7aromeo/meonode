'use client'
import { createElement, type ReactElement, useContext, useState } from 'react'
import { CacheProvider } from '@emotion/react'
import createCache from '@emotion/cache'
import { Node } from '@src/core.node.js'
import { NodeUtil } from '@src/util/node.util.js'
import { prefixer } from '@src/util/emotion-prefixer.util.js'
import { terminateRules } from '@src/util/rule-text.util.js'
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
  // text there for the flush. Its own plugins array keeps the rules Emotion
  // memoizes on the server with this cache, not in a process-wide memo.
  //
  // On the server, `order` lists each id as the cache inserts it, for the flush
  // below: where two elements' rules tie on specificity, insertion order decides
  // the winner, as it does in Emotion's own server render and in the browser. The
  // cache's `inserted` map cannot give that order back, since an object lists a
  // key made only of digits before the others. The browser never flushes, so its
  // cache keeps Emotion's own `insert` and nothing records the order there.
  const [{ cache, order, flushed }] = useState(() => {
    const emotionCache = createCache({ key: 'meonode-css', stylisPlugins: [prefixer] })
    emotionCache.compat = true
    const insertedOrder: string[] = []
    if (NodeUtil.isServer) {
      const insert = emotionCache.insert
      emotionCache.insert = (selector, serialized, sheet, shouldCache) => {
        const known = serialized.name in emotionCache.inserted
        const rules = insert(selector, serialized, sheet, shouldCache)
        if (!known && serialized.name in emotionCache.inserted) insertedOrder.push(serialized.name)
        return rules
      }
    }
    // How far into `order` this instance's flushes have read. `order` only grows,
    // so each flush reads only what came after the last one. Per instance, unlike
    // the set of flushed ids, since each pass of a render has an order of its own.
    return { cache: emotionCache, order: insertedOrder, flushed: { upTo: 0 } }
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
    const newIds: string[] = []
    for (let index = flushed.upTo; index < order.length; index++) {
      const id = order[index]
      if (!inserted.has(id) && typeof cache.inserted[id] === 'string') newIds.push(id)
    }
    flushed.upTo = order.length
    // Theme variables are emitted by ThemeProvider itself (a hoisted, deduped
    // `<style href precedence>`), not consumed from global state here.
    if (newIds.length === 0) {
      return null
    }

    // Mark IDs as inserted
    newIds.forEach(id => inserted.add(id))

    // In insertion order, which is render order, so the output is as deterministic as the render.
    const styles = newIds.map(id => terminateRules(cache.inserted[id] as string)).join('')
    const idsString = newIds.join(' ')

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

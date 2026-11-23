import { execFileSync, execSync } from 'node:child_process'
import { existsSync, globSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { rollup, type OutputOptions, type RollupOptions } from 'rollup'
import { beforeAll, describe, expect, it, vi } from 'vitest'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const CLIENT_FILES = [
  'dist/esm/components/theme-provider.client.js',
  'dist/esm/components/portal-provider.client.js',
  'dist/esm/components/portal-host.client.js',
  'dist/esm/components/style-registry.client.js',
  'dist/esm/components/styled-renderer.client.js',
  'dist/esm/components/meo-memo.client.js',
  'dist/esm/hook/useDataChannel.js',
  'dist/esm/hook/usePortal.js',
  'dist/esm/hook/useTheme.js',
  'dist/cjs/components/theme-provider.client.cjs',
  'dist/cjs/components/portal-provider.client.cjs',
  'dist/cjs/components/portal-host.client.cjs',
  'dist/cjs/components/style-registry.client.cjs',
  'dist/cjs/components/styled-renderer.client.cjs',
  'dist/cjs/components/meo-memo.client.cjs',
  'dist/cjs/hook/useDataChannel.cjs',
  'dist/cjs/hook/usePortal.cjs',
  'dist/cjs/hook/useTheme.cjs',
]

describe('build output: "use client" directive preservation', () => {
  beforeAll(() => {
    const distExists = existsSync(path.join(ROOT, 'dist/esm/main.js'))
    if (!distExists) {
      execSync('bun run build', { cwd: ROOT, stdio: 'inherit' })
    }
  }, 300_000)

  it.each(CLIENT_FILES)('%s starts with "use client"', rel => {
    const abs = path.join(ROOT, rel)
    expect(existsSync(abs)).toBe(true)
    const contents = readFileSync(abs, 'utf8')
    // Directive must be the first non-whitespace token. Match both quote styles
    // and allow the minified output to compress whitespace.
    expect(contents.trimStart()).toMatch(/^['"]use client['"]/)
  })
})

/**
 * A CommonJS build turns `import x from 'dep'` into a `require`, and how it reads
 * the default export from what `require` returns is its interop setting. A
 * dependency that marks `__esModule`, as `@emotion/cache` does, keeps its default
 * export on `.default`; one that does not, as `react`, is its own default.
 */
describe('build output: the CommonJS build', () => {
  /** Renders the same tree through one build's entries in its own Node process, and prints the HTML. */
  const TREE = `
    const tree = ({ Div, ThemeProvider }, { StyleRegistry }) =>
      StyleRegistry({
        children: ThemeProvider({
          modes: ['light'],
          defaultMode: 'light',
          tokens: { accent: { default: 'rgb(1, 2, 3)' }, space: 8 },
          children: Div({
            css: { color: 'red', '&:hover': { color: 'blue' } },
            opacity: 0.5,
            lineHeight: 2,
            zIndex: 3,
            padding: 8,
            flex: 1,
            children: [
              Div({ color: 'theme.accent', children: 'a' }),
              Div({ css: { '@media (min-width: 1px)': { padding: 'theme.space' } }, children: 'b' }),
            ],
          }),
        }),
      }).render()`

  const render = (format: 'esm' | 'cjs'): string =>
    execFileSync(
      process.execPath,
      format === 'esm'
        ? [
            '--input-type=module',
            '-e',
            `${TREE}
            const ui = await import(${JSON.stringify(path.join(ROOT, 'dist/esm/main.js'))})
            const registry = await import(${JSON.stringify(path.join(ROOT, 'dist/esm/nextjs-registry/index.js'))})
            const { renderToString } = await import('react-dom/server')
            process.stdout.write(renderToString(tree(ui, registry)))`,
          ]
        : [
            '-e',
            `${TREE}
            const ui = require(${JSON.stringify(path.join(ROOT, 'dist/cjs/main.cjs'))})
            const registry = require(${JSON.stringify(path.join(ROOT, 'dist/cjs/nextjs-registry/index.cjs'))})
            const { renderToString } = require('react-dom/server')
            process.stdout.write(renderToString(tree(ui, registry)))`,
          ],
      { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' },
    )

  // Class names hash the serialized css, so equal HTML is equal styles: a unitless
  // number given `px`, or a token resolved differently, shows as another class.
  it('renders styles, theme tokens and the style registry exactly as the ES module build does', () => {
    const esm = render('esm')
    expect(esm).toContain('class="meonode-css-')
    expect(esm).toContain('--meonode-theme-accent:rgb(1, 2, 3)')
    expect(render('cjs')).toBe(esm)
  })

  /**
   * Each package with a CommonJS build, the source files it is built from, and every
   * dependency that source default-imports. `@meonode/mui` default-imports none today;
   * it is read so that its first one is checked against its own build's settings.
   */
  const PACKAGES = [
    { name: '@meonode/ui', dir: ROOT },
    { name: '@meonode/mui', dir: path.resolve(ROOT, '../mui') },
  ].map(pkg => {
    const files = globSync('src/**/*.{ts,tsx}', { cwd: pkg.dir })
    const imports = files.flatMap(file =>
      [...readFileSync(path.join(pkg.dir, file), 'utf8').matchAll(/^import\s+([A-Za-z_$][\w$]*)\s*(?:,\s*\{[^}]*\})?\s+from\s+'([^'.][^']*)'/gm)]
        .map(([, , specifier]) => specifier)
        .filter(specifier => !specifier.startsWith('@src/')),
    )
    return { ...pkg, files, imports: [...new Set(imports)].sort() }
  })

  it('reads every source file of each package it checks', () => {
    for (const pkg of PACKAGES) {
      // Counted a second way, so a pattern that misses files cannot pass as a package with no default imports.
      const sources = readdirSync(path.join(pkg.dir, 'src'), { recursive: true, encoding: 'utf8' }).filter(file => /\.tsx?$/.test(file))
      expect(sources.length, pkg.name).toBeGreaterThan(0)
      expect(pkg.files.length, pkg.name).toBe(sources.length)
    }
    expect(PACKAGES[0].imports).toEqual(expect.arrayContaining(['@emotion/cache', 'react']))
  })

  // Compiled with the CommonJS output options the package's build uses, so a dependency
  // added later with either shape is checked as soon as the source default-imports it.
  it.each(PACKAGES.flatMap(pkg => pkg.imports.map(specifier => [pkg.name, specifier, pkg.dir])))(
    '%s reads the default export of %s as its ES module build does',
    async (_name, specifier, dir) => {
      const config = (await import(pathToFileURL(path.join(dir, 'rollup.config.ts')).href)).default as RollupOptions | RollupOptions[]
      const outputs = [config]
        .flat()
        .flatMap(options => [options.output ?? []].flat())
        .filter((output): output is OutputOptions => output.format === 'cjs')
      expect(outputs.length).toBeGreaterThan(0)

      // Imported by Node from inside the package, as its ES module build would be.
      const probeDir = path.join(dir, 'node_modules/.cache/cjs-interop-probe')
      mkdirSync(probeDir, { recursive: true })
      const esmProbe = path.join(probeDir, `${specifier.replace(/\W/g, '_')}.mjs`)
      writeFileSync(esmProbe, `import value from ${JSON.stringify(specifier)}\nexport { value }\n`)
      const expected = (await import(pathToFileURL(esmProbe).href)).value as unknown
      for (const [index, output] of outputs.entries()) {
        const bundle = await rollup({
          input: 'probe',
          external: id => id !== 'probe',
          plugins: [
            {
              name: 'probe',
              resolveId: id => (id === 'probe' ? id : null),
              load: id => (id === 'probe' ? `import value from ${JSON.stringify(specifier)}\nexport { value }` : null),
            },
          ],
        })
        const { output: chunks } = await bundle.generate({ format: 'cjs', exports: 'named', interop: output.interop })
        const file = path.join(probeDir, `${specifier.replace(/\W/g, '_')}-${index}.cjs`)
        writeFileSync(file, chunks[0].code)
        const actual = createRequire(file)(file).value as unknown
        expect(typeof actual, specifier).toBe(typeof expected)
        if (typeof expected === 'function') expect((actual as { name: string }).name).toBe((expected as { name: string }).name)
        else expect(Object.keys(actual as object).sort()).toEqual(Object.keys(expected as object).sort())
      }
    },
  )
})

/**
 * The package ships a default build, `dist/{esm,cjs}`, and a server build,
 * `dist/rsc/{esm,cjs}`, which bundlers load in the React Server Components layer
 * through the `react-server` export condition.
 */
describe('build output: the server build and the default build', () => {
  const SRC = path.join(ROOT, 'src')
  const FORMATS = [
    { format: 'esm', ext: '.js' },
    { format: 'cjs', ext: '.cjs' },
  ] as const

  /** Every built file under `dir`, relative to the package root. */
  const filesUnder = (dir: string): string[] => globSync('**/*.{js,cjs}', { cwd: path.join(ROOT, dir) }).map(file => path.join(dir, file))

  /** The source modules that open with the `'use client'` directive, relative to `src/`, without extension. */
  const CLIENT_MODULES = globSync('**/*.ts', { cwd: SRC })
    .filter(file => /^['"]use client['"]/.test(readFileSync(path.join(SRC, file), 'utf8').trimStart()))
    .map(file => file.replace(/\.ts$/, ''))

  /**
   * A string only the server-layer path writes: the key of the `ThemedRule` a
   * server component's element is carried with. Its absence from the default
   * build means that path was folded out of it.
   */
  const SERVER_PATH_MARKER = ':themed`'

  it('finds the client modules it checks', () => {
    expect(CLIENT_MODULES).toContain('components/styled-renderer.client')
    expect(CLIENT_MODULES).toContain('components/theme-provider.client')
  })

  it.each(FORMATS)('keeps the server-layer path out of the default $format build and in the server one', ({ format }) => {
    const withMarker = (dir: string) => filesUnder(dir).filter(file => readFileSync(path.join(ROOT, file), 'utf8').includes(SERVER_PATH_MARKER))
    expect(withMarker(`dist/${format}`)).toEqual([])
    expect(withMarker(`dist/rsc/${format}`)).not.toEqual([])
    // The module that compiles a server component's css, which only that path imports.
    expect(filesUnder(`dist/${format}`).filter(file => file.includes('server-emotion.util'))).toEqual([])
    expect(filesUnder(`dist/rsc/${format}`).filter(file => file.includes('server-emotion.util'))).toHaveLength(1)
  })

  it.each(FORMATS)('builds each client module once, in the default $format build', ({ format, ext }) => {
    for (const module of CLIENT_MODULES) {
      const copies = [...filesUnder(`dist/${format}`), ...filesUnder(`dist/rsc/${format}`)].filter(file => file.endsWith(`${path.sep}${module}${ext}`))
      expect(copies, module).toEqual([path.join(`dist/${format}`, `${module}${ext}`)])
    }
  })

  it.each(FORMATS)('imports the client modules from the default build in the server $format build, and every import resolves', ({ format, ext }) => {
    const clientFiles = new Set(CLIENT_MODULES.map(module => path.join(ROOT, `dist/${format}`, `${module}${ext}`)))
    const reached = new Set<string>()
    for (const file of filesUnder(`dist/rsc/${format}`)) {
      const abs = path.join(ROOT, file)
      for (const [, spec] of readFileSync(abs, 'utf8').matchAll(/(?:from|import|require\()\s*["'](\.{1,2}\/[^"']+)["']/g)) {
        const target = path.resolve(path.dirname(abs), spec)
        expect(existsSync(target), `${file} → ${spec}`).toBe(true)
        expect(target.startsWith(path.join(ROOT, 'dist/rsc')) || clientFiles.has(target), `${file} → ${spec}`).toBe(true)
        if (clientFiles.has(target)) reached.add(target)
      }
    }
    expect(reached.size).toBeGreaterThan(0)
  })

  // Both formats come from the same inputs; the ESM output names its imports statically.
  it('exports from each client module every name the server build imports from it', () => {
    const clientFiles = new Set(CLIENT_MODULES.map(module => path.join(ROOT, 'dist/esm', `${module}.js`)))
    const exportsOf = (file: string): Set<string> => {
      const text = readFileSync(file, 'utf8')
      const names = [...text.matchAll(/export\s*\{([^}]*)\}/g)].flatMap(([, list]) =>
        list.split(',').map(part =>
          part
            .trim()
            .split(/\s+as\s+/)
            .pop()!,
        ),
      )
      if (/export default/.test(text)) names.push('default')
      return new Set(names)
    }
    let checked = 0
    for (const file of filesUnder('dist/rsc/esm')) {
      const abs = path.join(ROOT, file)
      for (const [, defaultName, list, spec] of readFileSync(abs, 'utf8').matchAll(
        /import\s*(?:([\w$]+)\s*,?\s*)?(?:\{([^}]*)\})?\s*from\s*["'](\.{1,2}\/[^"']+)["']/g,
      )) {
        const target = path.resolve(path.dirname(abs), spec)
        if (!clientFiles.has(target)) continue
        const wanted = [
          ...(defaultName ? ['default'] : []),
          ...(list ?? '')
            .split(',')
            .map(part => part.trim().split(/\s+as\s+/)[0])
            .filter(Boolean),
        ]
        const available = exportsOf(target)
        for (const name of wanted) {
          expect(available.has(name), `${file} imports ${name} from ${spec}`).toBe(true)
          checked++
        }
      }
    }
    expect(checked).toBeGreaterThan(0)
  })

  /** Runs Node in the package, with `--conditions=react-server` when `reactServer` is set; resolves to its trimmed output. */
  const node = (code: string, { reactServer = false, module = true } = {}): string =>
    execFileSync(process.execPath, [...(reactServer ? ['--conditions=react-server'] : []), ...(module ? ['--input-type=module'] : []), '-e', code], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: 'pipe',
    }).trim()

  const SUBPATHS = [
    { specifier: '@meonode/ui', file: 'main' },
    { specifier: '@meonode/ui/client', file: 'client' },
    { specifier: '@meonode/ui/nextjs-registry', file: 'nextjs-registry/index' },
    { specifier: '@meonode/ui/factory-call', file: 'factory-call/index' },
  ]

  it.each(SUBPATHS)('resolves $specifier to the server build under `react-server` and to the default build otherwise', ({ specifier, file }) => {
    const resolveImport = `console.log(new URL(import.meta.resolve(${JSON.stringify(specifier)})).pathname)`
    const resolveRequire = `console.log(require.resolve(${JSON.stringify(specifier)}))`
    expect(node(resolveImport, { reactServer: true })).toBe(path.join(ROOT, `dist/rsc/esm/${file}.js`))
    expect(node(resolveRequire, { reactServer: true, module: false })).toBe(path.join(ROOT, `dist/rsc/cjs/${file}.cjs`))
    expect(node(resolveImport)).toBe(path.join(ROOT, `dist/esm/${file}.js`))
    expect(node(resolveRequire, { module: false })).toBe(path.join(ROOT, `dist/cjs/${file}.cjs`))
  })

  /** The preload that loads `'use client'` modules as client references, as a bundler's server layer does. */
  const CLIENT_REFERENCES = path.join(ROOT, 'tests/react-server-client-references.mjs')

  // The server layer runs the server build's own modules and the packages they
  // import, against React's react-server build, which has no client hooks; a
  // package that creates a context at load fails there too. Node links an ES
  // module graph before running it, so a missing named import fails as well.
  // `@meonode/ui/client` is the browser entry: it imports `react-dom/client`,
  // which refuses the server layer itself.
  const SERVER_SUBPATHS = SUBPATHS.filter(({ specifier }) => specifier !== '@meonode/ui/client')
  it.each(SERVER_SUBPATHS.flatMap(subpath => FORMATS.map(({ format }) => ({ ...subpath, format }))))(
    'links and loads $specifier from the server $format build under `react-server`',
    ({ specifier, format }) => {
      const load = format === 'esm' ? `await import(${JSON.stringify(specifier)})` : `require(${JSON.stringify(specifier)})`
      const run = () =>
        execFileSync(
          process.execPath,
          [
            '--conditions=react-server',
            '--import',
            CLIENT_REFERENCES,
            ...(format === 'esm' ? ['--input-type=module'] : []),
            '-e',
            `${load}; console.log('loaded')`,
          ],
          {
            cwd: ROOT,
            encoding: 'utf8',
            stdio: 'pipe',
          },
        ).trim()
      let failure = ''
      let output = ''
      try {
        output = run()
      } catch (error) {
        failure = String((error as { stderr?: string }).stderr)
      }
      expect(failure.split('\n').find(line => /Error/.test(line)) ?? '').toBe('')
      expect(output).toBe('loaded')
    },
  )

  const GUARD_MESSAGE = '[MeoNode] The default entry of @meonode/ui was loaded in the React Server Components layer'

  it('refuses to load its default cjs entry in Node, where `react` resolves to its react-server build', () => {
    let failure = ''
    try {
      node(`require(${JSON.stringify(path.join(ROOT, 'dist/cjs/main.cjs'))})`, { reactServer: true, module: false })
    } catch (error) {
      failure = String((error as { stderr?: string }).stderr)
    }
    expect(failure).toContain(GUARD_MESSAGE)
  })

  // Node links an ES module graph before running any of it, and the react-server
  // build of `react` lacks hooks the client modules import, so there the link
  // error comes first. A bundler runs the imports in order, as Vitest does here.
  it('refuses to load its default esm entry where a bundler resolves `react` to its react-server build', async () => {
    const require = createRequire(import.meta.url)
    const reactServer = path.join(path.dirname(require.resolve('react/package.json')), 'react.react-server.js')
    vi.resetModules()
    vi.doMock('react', () => require(reactServer))
    try {
      await expect(import(path.join(ROOT, 'dist/esm/main.js'))).rejects.toThrow(GUARD_MESSAGE)
    } finally {
      vi.doUnmock('react')
      vi.resetModules()
    }
  })
})

/**
 * Webpack checks each member read of a namespace import, `React.Activity` as much as
 * `import { Activity }`, against the exports the imported module declares, and in a
 * package marked `"type": "module"` a missing one fails the build. Next.js 15 renders
 * with a vendored React that has no `Activity`, so the package has to build against
 * a React without it.
 */
type Webpack = (config: object, callback: (error: Error | null, stats?: { toJson(options: object): { errors?: { message: string }[] } }) => void) => void

describe('build output: webpack against a React without Activity', () => {
  const WORK = path.join(ROOT, 'node_modules/.cache/webpack-react-exports')
  const requireFromRoot = createRequire(path.join(ROOT, 'package.json'))
  /** The webpack Next.js builds with. Next 15 and 16 both ship 5.98, which keeps a member read that an `in` check guards. */
  const { webpack } = (requireFromRoot('next/dist/compiled/webpack/bundle5') as () => { webpack: Webpack })()

  /** A CommonJS React that names each export on its own line, as React's builds do, so webpack knows every one; all but `omit`. */
  const stubReact = (omit: string): string => {
    const real = requireFromRoot.resolve('react')
    const names = Object.keys(requireFromRoot('react') as object).filter(name => name !== omit)
    const file = path.join(WORK, `react-without-${omit}.cjs`)
    mkdirSync(WORK, { recursive: true })
    writeFileSync(file, [`const React = require(${JSON.stringify(real)})`, ...names.map(name => `exports.${name} = React.${name}`)].join('\n'))
    return file
  }

  /** Bundles `source` for the browser with `react` standing in for React, and returns webpack's errors. */
  const bundle = (name: string, source: string, react: string): Promise<string[]> => {
    const entry = path.join(WORK, `${name}.js`)
    writeFileSync(entry, source)
    return new Promise((resolve, reject) => {
      webpack(
        {
          mode: 'none',
          target: 'web',
          context: ROOT,
          entry,
          output: { path: path.join(WORK, `out-${name}`) },
          resolve: { alias: { react$: react } },
          module: { parser: { javascript: { exportsPresence: 'error' } } },
        },
        (error, stats) => {
          if (error || !stats) return reject(error ?? new Error('webpack returned no stats'))
          resolve((stats.toJson({ all: false, errors: true }).errors ?? []).map(entry => entry.message))
        },
      )
    })
  }

  it('fails a namespace read of the missing export, so the check is live', async () => {
    const errors = await bundle('namespace-read', `import * as React from 'react'\nconsole.log(React.Activity)\n`, stubReact('Activity'))
    expect(errors.join('\n')).toMatch(/export 'Activity' \(imported as 'React'\) was not found in 'react'/)
  })

  it('builds the package entry', async () => {
    const errors = await bundle('package-entry', `import { Activity, Div } from '@meonode/ui'\nconsole.log(Activity, Div)\n`, stubReact('Activity'))
    expect(errors).toEqual([])
  })
})

/**
 * `@meonode/ui/factory-call` is what compiled output imports to call a factory
 * from another module. A module the compiler rewrites, such as a route handler
 * calling a factory, must load nothing more for it: the entry imports nothing,
 * and reads the brands core gives the factories it makes, from whichever copy.
 */
describe('build output: the factory-call entry', () => {
  const ENTRY_FILES = [
    'dist/esm/factory-call/index.js',
    'dist/cjs/factory-call/index.cjs',
    'dist/rsc/esm/factory-call/index.js',
    'dist/rsc/cjs/factory-call/index.cjs',
  ]

  it.each(ENTRY_FILES)('%s imports and requires nothing', file => {
    const code = readFileSync(path.join(ROOT, file), 'utf8')
    expect(code).toContain('__meoFactoryCall')
    expect(code.match(/\bimport\s*(?:[\w{*]|['"])|\bimport\(|\brequire\(/g)).toBeNull()
  })

  it.each([false, true])('loads only itself from the CommonJS build (react-server: %s)', reactServer => {
    const loaded = JSON.parse(
      execFileSync(
        process.execPath,
        [
          ...(reactServer ? ['--conditions=react-server'] : []),
          '-e',
          `const { __meoFactoryCall } = require('@meonode/ui/factory-call')
           const plain = (props, extra) => ({ props, extra })
           const called = __meoFactoryCall(plain, { at: 0 }, { a: 1 }, 2)
           console.log(JSON.stringify({ called, modules: Object.keys(require.cache).map(file => require('node:path').relative(${JSON.stringify(ROOT)}, file)) }))`,
        ],
        { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' },
      ),
    )
    expect(loaded).toEqual({
      called: { props: { a: 1 }, extra: 2 },
      modules: [reactServer ? 'dist/rsc/cjs/factory-call/index.cjs' : 'dist/cjs/factory-call/index.cjs'],
    })
  })

  /** The preload that loads `'use client'` modules as client references, as a bundler's server layer does. */
  const CLIENT_REFERENCES = path.join(ROOT, 'tests/react-server-client-references.mjs')

  it.each([
    { build: 'default', format: 'esm' },
    { build: 'default', format: 'cjs' },
    { build: 'server', format: 'esm' },
    { build: 'server', format: 'cjs' },
  ] as const)('joins a call of a factory core made, in the $build $format build', ({ build, format }) => {
    const load = (specifier: string) => (format === 'esm' ? `await import(${JSON.stringify(specifier)})` : `require(${JSON.stringify(specifier)})`)
    const code = `
      const ui = ${load('@meonode/ui')}
      const leaf = ${load('@meonode/ui/factory-call')}
      const Box = ui.createNode('div', { padding: 8 })
      const named = call => typeof call(Box, { at: 0 }, { margin: 4, children: 'x' }).props.__meo$n
      const before = named(leaf.__meoFactoryCall)
      const main = named(ui.__meoFactoryCall)
      console.log(JSON.stringify({ before, main, after: named(leaf.__meoFactoryCall) }))`
    const args = [
      ...(build === 'server' ? ['--conditions=react-server', '--import', CLIENT_REFERENCES] : []),
      ...(format === 'esm' ? ['--input-type=module', '-e', code] : ['-e', `(async () => {${code}})()`]),
    ]
    const result = JSON.parse(execFileSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' }).trim().split('\n').at(-1)!)
    // The light entry joins once the join, which `@meonode/ui` exports the name from, has run.
    expect(result).toEqual({ before: 'undefined', main: 'string', after: 'string' })
  })

  /** The build's modules that render code into `source` bundled by rollup against an ESM build, every other package left external. */
  async function treeShaken(source: string, build: 'esm' | 'rsc/esm'): Promise<string[]> {
    const entry = '\0app'
    const bundle = await rollup({
      input: entry,
      external: id => !id.startsWith('.') && !id.startsWith('/') && id !== entry && id !== '@meonode/ui',
      plugins: [
        {
          name: 'app',
          resolveId: id => (id === entry ? id : id === '@meonode/ui' ? path.join(ROOT, 'dist', build, 'main.js') : null),
          load: id => (id === entry ? source : null),
        },
      ],
      onwarn: () => {},
    })
    const { output } = await bundle.generate({ format: 'esm' })
    await bundle.close()
    return output.flatMap(chunk =>
      'modules' in chunk
        ? Object.entries(chunk.modules)
            .filter(([, module]) => module.renderedLength > 0)
            // The server build loads its client components from the default build's files.
            .map(([id]) => path.relative(path.join(ROOT, 'dist', build), id).replace(/^(\.\.\/)+esm\//, ''))
        : [],
    )
  }

  // An app built without the compiler never imports the name, nor registers a
  // compiled style, so neither the join nor what renders a registered style (the
  // named runtime, the compiled-style resolution, the resolver of themed
  // conditions, the registry) reaches its bundle; compiled output brings in what
  // it uses. In the server build, the element a server component hands a client
  // reference is itself a client reference, which a bundler ships to the
  // browser wherever a server module imports it: only the named runtime does.
  const APPS = [
    [
      'an app built without the compiler',
      `import { createNode, createChildrenFirstNode, Div, ThemeProvider } from '@meonode/ui'\nexport default [createNode, createChildrenFirstNode, Div, ThemeProvider]`,
      false,
      false,
    ],
    ['compiled output with no joined call', `import { Div, registerStaticCss } from '@meonode/ui'\nexport default [Div, registerStaticCss]`, false, true],
    ['compiled output with a joined call', `import { Div, __meoFactoryCall } from '@meonode/ui'\nexport default [Div, __meoFactoryCall]`, true, true],
  ] as const
  it.each((['esm', 'rsc/esm'] as const).flatMap(build => APPS.map(app => [build, ...app] as const)))(
    'tree-shakes the %s build for %s',
    async (build, _, source, join, registers) => {
      const modules = await treeShaken(source, build)
      expect(modules).toContain('core.node.js')
      expect(modules.includes('factory-call/join.js')).toBe(join)
      for (const module of [
        'util/themed-text.util.js',
        'util/named-runtime.util.js',
        'util/compiled-style.util.js',
        'util/named-style.util.js',
        'util/static-css.util.js',
        'components/compiled-styled-renderer.client.js',
      ])
        expect([module, modules.includes(module)]).toEqual([module, registers])
    },
  )
})

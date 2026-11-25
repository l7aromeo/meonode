import { execFileSync, execSync } from 'node:child_process'
import { existsSync, globSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { rollup, type OutputOptions, type RollupOptions } from 'rollup'
import nodeResolve from '@rollup/plugin-node-resolve'
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

/**
 * The development diagnostics stay out of a production browser bundle: the
 * bundler substitutes `process.env.NODE_ENV`, which leaves nothing importing
 * them but the lazy load `setDebugMode(true)` starts, so each bundler splits
 * them into a chunk of their own (#134).
 */
describe('build output: a production browser bundle', () => {
  const WORK = path.join(ROOT, 'node_modules/.cache/production-bundle')
  const requireFromRoot = createRequire(path.join(ROOT, 'package.json'))
  const { webpack } = (requireFromRoot('next/dist/compiled/webpack/bundle5') as () => { webpack: Webpack })()
  const esbuild = requireFromRoot('esbuild') as typeof import('esbuild')
  const rolldown = requireFromRoot('rolldown') as typeof import('rolldown')

  /**
   * An app using the theme, a factory, a list and `setDebugMode`, so each
   * diagnostic has a caller. It hands them to the page, since a bundler drops
   * what an entry only exports.
   */
  const APP = `
    import { Div, For, ThemeProvider, setDebugMode } from '@meonode/ui'
    globalThis.app = {
      setDebugMode,
      render: rows =>
        ThemeProvider({
          modes: ['light'],
          defaultMode: 'light',
          tokens: { accent: 'red' },
          children: Div({ color: 'theme.accent', children: For(rows, row => Div({ children: row.label }), row => row.id) }),
        }).render(),
    }
  `

  /** One message from each part: the theme checks, the generated-list report, the deps and style-value checks. */
  const MESSAGES = ['is not defined by the active theme', 'list without keys came from one call site', 'deps must be an array', 'which no style can be']

  /** Text only the named styles' diagnostics hold: their check after commit reads React's fibers. */
  const NAMED_ONLY = '__reactFiber$'

  /** Packages the app leaves to the page; only MeoNode's own code is under test. */
  const EXTERNAL = [
    'react',
    'react-dom',
    'react/jsx-runtime',
    '@emotion/react',
    '@emotion/cache',
    '@emotion/serialize',
    '@emotion/unitless',
    '@emotion/utils',
    'stylis',
  ]

  /** The code a page loads with the app, and the code it can load later. */
  interface Chunks {
    initial: string[]
    lazy: string[]
  }

  /** Splits chunks into those the entry imports statically, itself included, and the rest. */
  const byLoad = (entry: string, chunks: Map<string, { code: string; imports: string[] }>): Chunks => {
    const initial = new Set<string>()
    const visit = (name: string) => {
      if (initial.has(name)) return
      initial.add(name)
      for (const imported of chunks.get(name)?.imports ?? []) visit(imported)
    }
    visit(entry)
    const all = [...chunks.entries()]
    return {
      initial: all.filter(([name]) => initial.has(name)).map(([, chunk]) => chunk.code),
      lazy: all.filter(([name]) => !initial.has(name)).map(([, chunk]) => chunk.code),
    }
  }

  const esbuildChunks = async (): Promise<Chunks> => {
    const outdir = path.join(WORK, 'esbuild')
    const result = await esbuild.build({
      stdin: { contents: APP, resolveDir: ROOT, loader: 'js' },
      bundle: true,
      splitting: true,
      format: 'esm',
      platform: 'browser',
      minify: true,
      write: false,
      metafile: true,
      outdir,
      define: { 'process.env.NODE_ENV': '"production"' },
      external: EXTERNAL,
      // The package's tsconfig maps `@meonode/ui` to its sources; the app gets the build.
      alias: { '@meonode/ui': path.join(ROOT, 'dist/esm/main.js') },
      logLevel: 'silent',
    })
    const code = new Map(result.outputFiles.map(file => [path.relative(process.cwd(), file.path), file.text]))
    const chunks = new Map(
      Object.entries(result.metafile.outputs).map(([name, output]) => [
        name,
        { code: code.get(name) ?? '', imports: output.imports.filter(entry => entry.kind === 'import-statement').map(entry => entry.path) },
      ]),
    )
    return byLoad(
      Object.keys(result.metafile.outputs).find(name => result.metafile.outputs[name].entryPoint !== undefined)!,
      chunks,
    )
  }

  const webpackChunks = (): Promise<Chunks> => {
    const entry = path.join(WORK, 'webpack-entry.js')
    const outdir = path.join(WORK, 'webpack')
    mkdirSync(WORK, { recursive: true })
    writeFileSync(entry, APP)
    return new Promise((resolve, reject) => {
      webpack(
        {
          mode: 'production',
          target: 'web',
          context: ROOT,
          entry,
          output: { path: outdir, filename: 'main.js', chunkFilename: '[id].chunk.js', clean: true },
          // Next's webpack loads its minimizer from Next; webpack itself drops
          // the branch `process.env.NODE_ENV` rules out, and with it the import.
          optimization: { minimize: false },
          externals: Object.fromEntries(EXTERNAL.map(name => [name, `commonjs ${name}`])),
        },
        (error, stats) => {
          const json = stats?.toJson({ all: false, errors: true, chunks: true }) as
            { errors?: { message: string }[]; chunks?: { initial: boolean; files: string[] }[] } | undefined
          const errors = json?.errors ?? []
          if (error || !json || errors.length > 0)
            return reject(error ?? new Error(errors.map(entry => entry.message).join('\n') || 'webpack returned no stats'))
          const read = (initial: boolean) =>
            (json.chunks ?? [])
              .filter(chunk => chunk.initial === initial)
              .flatMap(chunk => chunk.files.filter(file => file.endsWith('.js')))
              .map(file => readFileSync(path.join(outdir, file), 'utf8'))
          resolve({ initial: read(true), lazy: read(false) })
        },
      )
    })
  }

  // Resolved as Vite resolves it, which reads the package's `sideEffects`.
  const rollupChunks = async (): Promise<Chunks> => {
    const entry = '\0app'
    const bundle = await rollup({
      input: entry,
      external: id => EXTERNAL.some(name => id === name || id.startsWith(`${name}/`)),
      plugins: [
        {
          name: 'app',
          resolveId: id => (id === entry ? id : null),
          load: id => (id === entry ? APP : null),
          transform: code => code.replaceAll('process.env.NODE_ENV', '"production"'),
        },
        nodeResolve({ browser: true, rootDir: ROOT }),
      ],
      onwarn: () => {},
    })
    const { output } = await bundle.generate({ format: 'esm' })
    await bundle.close()
    const chunks = output.flatMap(chunk => (chunk.type === 'chunk' ? [chunk] : []))
    return byLoad(chunks.find(chunk => chunk.isEntry)!.fileName, new Map(chunks.map(chunk => [chunk.fileName, { code: chunk.code, imports: chunk.imports }])))
  }

  // Rolldown, as Vite 8 runs it, pointed at the build: it reads the package's `sideEffects` too.
  const rolldownChunks = async (): Promise<Chunks> => {
    const entry = '\0app'
    const bundle = await rolldown.rolldown({
      input: entry,
      platform: 'browser',
      external: id => EXTERNAL.some(name => id === name || id.startsWith(`${name}/`)),
      resolve: { alias: { '@meonode/ui': path.join(ROOT, 'dist/esm/main.js') } },
      transform: { define: { 'process.env.NODE_ENV': '"production"' } },
      plugins: [{ name: 'app', resolveId: id => (id === entry ? id : null), load: id => (id === entry ? APP : null) }],
      onwarn: () => {},
    })
    const { output } = await bundle.generate({ format: 'esm', minify: true })
    await bundle.close()
    const chunks = output.flatMap(chunk => (chunk.type === 'chunk' ? [chunk] : []))
    return byLoad(chunks.find(chunk => chunk.isEntry)!.fileName, new Map(chunks.map(chunk => [chunk.fileName, { code: chunk.code, imports: chunk.imports }])))
  }

  // Run by Bun's own bundler, pointed at the build: the package's tsconfig maps `@meonode/ui` to its sources.
  const bunChunks = async (): Promise<Chunks> => {
    const outdir = path.join(WORK, 'bun')
    const entry = path.join(WORK, 'bun-entry.js')
    rmSync(outdir, { recursive: true, force: true })
    mkdirSync(WORK, { recursive: true })
    writeFileSync(entry, APP.replace("'@meonode/ui'", JSON.stringify(path.join(ROOT, 'dist/esm/main.js'))))
    execFileSync(
      'bun',
      [
        'build',
        entry,
        '--splitting',
        '--target=browser',
        '--minify',
        '--define',
        'process.env.NODE_ENV="production"',
        ...EXTERNAL.flatMap(name => ['--external', name]),
        '--outdir',
        outdir,
      ],
      { stdio: 'pipe' },
    )
    // A static import is `import"./…"` or `from"./…"`; a dynamic one is `import("./…")`.
    const chunks = new Map(
      readdirSync(outdir)
        .filter(file => file.endsWith('.js'))
        .map(file => {
          const code = readFileSync(path.join(outdir, file), 'utf8')
          return [file, { code, imports: [...code.matchAll(/(?:\bfrom|\bimport)\s*"\.\/([^"]+)"/g)].map(match => match[1]) }]
        }),
    )
    return byLoad('bun-entry.js', chunks)
  }

  it.each([
    ['webpack', webpackChunks],
    ['rollup', rollupChunks],
    ['Rolldown', rolldownChunks],
    ['Bun', bunChunks],
  ] as const)(
    'leaves every diagnostic message out of what %s loads first, and in a chunk it can load later',
    async (_, build) => {
      const { initial, lazy } = await build()
      // The one module the package keeps for its side effect alone, by `sideEffects`.
      expect(initial.some(code => code.includes('was loaded in the React Server Components layer'))).toBe(true)
      for (const message of MESSAGES) {
        expect([message, initial.some(code => code.includes(message))]).toEqual([message, false])
        expect([message, lazy.some(code => code.includes(message))]).toEqual([message, true])
      }
      // The app renders no named styles, so their diagnostics' table is left out
      // whole: the check after commit, which alone reads React's fibers, is in no chunk.
      expect([...initial, ...lazy].some(code => code.includes(NAMED_ONLY))).toBe(false)
    },
    120_000,
  )

  // esbuild's code splitting places a module in a chunk by whether any entry
  // imports it statically, whether or not the import is used once
  // `process.env.NODE_ENV` is folded, so the diagnostics share a chunk the page
  // loads first, as they did before they were split out.
  it('leaves the diagnostics in what esbuild loads first', async () => {
    const { initial, lazy } = await esbuildChunks()
    expect(initial.some(code => code.includes('was loaded in the React Server Components layer'))).toBe(true)
    for (const message of MESSAGES)
      expect([message, initial.some(code => code.includes(message)), lazy.some(code => code.includes(message))]).toEqual([message, true, false])
  })
})

/**
 * `setDebugMode(true)` in a production build loads the diagnostics, which the
 * build leaves out, and reports the checks made while they load once they
 * arrive, in the order they were made (#134).
 */
describe('build output: debug mode in a production build', () => {
  /** Runs `body` against the ES module build in Node with `NODE_ENV=production`, and returns what it logged, in order, with where the render ended. */
  const run = (body: string, entry = '@meonode/ui'): { logs: [level: string, text: string][]; rendered: number } => {
    const code = `
      const logs = []
      for (const level of ['log', 'warn', 'error'])
        console[level] = (...args) => logs.push([level, args.map(arg => (arg instanceof Error ? arg.name + ': ' + arg.message + '\\n' + arg.stack : String(arg))).join(' ')])
      const ui = await import(${JSON.stringify(entry)})
      const { renderToString } = await import('react-dom/server')
      let rendered = -1
      const settle = () => new Promise(resolve => setTimeout(resolve, 200))
      ${body}
      process.stdout.write(JSON.stringify({ logs, rendered }))`
    return JSON.parse(
      // A render of thousands of nodes logs a line for each.
      execFileSync(process.execPath, ['--input-type=module', '-e', code], {
        cwd: ROOT,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        env: { ...process.env, NODE_ENV: 'production' },
      }),
    )
  }

  /** A provider whose children make a theme check, then a literal check, then a list reported from one call site. */
  const RENDER = `
    const { Div, ThemeProvider, setDebugMode } = ui
    setDebugMode(true)
    const list = count => Div({ children: Array.from({ length: count }, () => Div({ children: 'row' })) })
    const lists = [2, 3].map(count => list(count))
    renderToString(
      ThemeProvider({
        modes: ['light'],
        defaultMode: 'light',
        tokens: { accent: 'red' },
        children: [Div({ key: 'a', color: 'theme.missing' }), Div({ key: 'b', padding: '12' }), ...lists],
      }).render(),
    )
    rendered = logs.length
    await settle()`

  it('reports the checks made before the diagnostics loaded, once they load, in order', () => {
    const { logs, rendered } = run(RENDER)
    expect(logs.slice(0, rendered)).toEqual([['log', '[MeoNode] Debug mode enabled.']])
    const after = logs.slice(rendered)
    // The lists are built before the render's checks run.
    expect(after.map(([level, text]) => [level, text.split('. ')[0]])).toEqual([
      ['warn', '[MeoNode] A `children` list without keys came from one call site with 2, then 3 items, so it is generated at runtime rather than written out'],
      ['warn', '[MeoNode] theme.missing (used for `color`) is not defined by the active theme'],
      ['warn', '[MeoNode] `padding: "12"` is a number written as a string, so Emotion does not add `px` to it — it only does that for real numbers'],
    ])
    // The list's call site was read where the calls were made, not where the check ran.
    expect(after[0][1]).toMatch(/MeoNode call site: The unkeyed list above was passed as `children` here\.\n\s+at list /)
  })

  it('reports nothing for the checks made while debug mode was on, if it is turned off before they load', () => {
    const { logs } = run(RENDER.replace('rendered = logs.length', 'ui.setDebugMode(false)\n    rendered = logs.length'))
    expect(logs).toEqual([['log', '[MeoNode] Debug mode enabled.']])
  })

  /** Renders `count` nodes, each with a literal check to report, with debug mode on, and returns what was logged after the render. */
  const renderNodes = (count: number) => {
    const { logs, rendered } = run(`
      const { Div, setDebugMode } = ui
      setDebugMode(true)
      renderToString(Div({ children: Array.from({ length: ${count} }, (_, index) => Div({ key: index, padding: String(index + 1) })) }).render())
      rendered = logs.length
      await settle()`)
    const after = logs.slice(rendered)
    return { after, dropped: after.filter(([, text]) => text.includes('checks made while its diagnostics loaded were dropped')) }
  }

  it('holds every check of a first render of 14,000 nodes while the diagnostics load', () => {
    const { after, dropped } = renderNodes(14_000)
    expect(dropped).toHaveLength(0)
    expect(after).toHaveLength(14_000)
  })

  it('holds a bounded number of checks while the diagnostics load, and reports how many it dropped', () => {
    const { after, dropped } = renderNodes(20_000)
    expect(dropped).toHaveLength(1)
    expect(dropped[0][1]).toMatch(/^\[MeoNode\] Debug mode: \d+ checks made while its diagnostics loaded were dropped/)
    // One literal report per node until the bound, and none after the notice.
    expect(after.at(-1)).toBe(dropped[0])
    expect(after.length - 1).toBeLessThan(20_000)
  })

  // A bundle, since Node loads the build's static import of the diagnostics
  // whether or not it runs.
  it('reports a diagnostics chunk that fails to load', async () => {
    const outdir = path.join(ROOT, 'node_modules/.cache/debug-mode-missing-chunk')
    rmSync(outdir, { recursive: true, force: true })
    const entry = '\0ui'
    const bundle = await rollup({
      input: { ui: entry },
      external: id => !id.startsWith('.') && !id.startsWith('/') && !id.startsWith('\0') && id !== '@meonode/ui',
      plugins: [
        {
          name: 'ui',
          resolveId: id => (id === entry ? id : null),
          load: id => (id === entry ? `export * from '@meonode/ui'` : null),
          transform: code => code.replaceAll('process.env.NODE_ENV', '"production"'),
        },
        nodeResolve({ rootDir: ROOT }),
      ],
      onwarn: () => {},
    })
    const { output } = await bundle.write({ dir: outdir, format: 'esm', entryFileNames: '[name].mjs', chunkFileNames: '[name]-[hash].mjs' })
    await bundle.close()
    const lazy = output.filter(chunk => chunk.type === 'chunk' && chunk.facadeModuleId?.endsWith('/lazy-diagnostics.util.js'))
    expect(lazy).toHaveLength(1)
    rmSync(path.join(outdir, lazy[0].fileName))
    const { logs, rendered } = run(RENDER, pathToFileURL(path.join(outdir, 'ui.mjs')).href)
    expect(logs.slice(rendered).map(([level, text]) => [level, text.split('\n')[0].replace(/'.*/, '')])).toEqual([
      ['error', '[MeoNode] Debug mode could not load its diagnostics. Error: Cannot find module '],
    ])
  })
})

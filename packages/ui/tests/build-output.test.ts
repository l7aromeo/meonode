import { execFileSync, execSync } from 'node:child_process'
import { existsSync, globSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { rollup, type OutputOptions, type RollupOptions } from 'rollup'
import { beforeAll, describe, expect, it } from 'vitest'

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

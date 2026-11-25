// @vitest-environment node
//
// In production, debug mode loads each table of diagnostics registered with
// `diagnostics.util.ts` and runs the checks made meanwhile in the order they
// were made, across tables, once every table has arrived.
import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.resetModules()
})

/** A promise and the function that settles it. */
const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}

/** Loads the diagnostics module as a production build does, with debug mode on and its log quiet. */
const loadInProduction = async () => {
  vi.resetModules()
  vi.stubEnv('NODE_ENV', 'production')
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const diagnostics = await import('@src/util/diagnostics.util.js')
  expect(diagnostics.loadedDiagnostics()).toBeUndefined()
  return diagnostics
}

it('runs the checks of every table in the order they were made, once the last table arrives, a table registered meanwhile included', async () => {
  const diagnostics = await loadInProduction()
  const first = deferred<{ name: string }>()
  const firstLoad = vi.fn(() => first.promise)
  const firstTable = diagnostics.registerDiagnostics<{ name: string }>(undefined, firstLoad)
  diagnostics.setDebugMode(true)

  const ran: string[] = []
  diagnostics.withDiagnostics(() => ran.push('core 1'))
  firstTable.withDiagnostics(table => ran.push(table.name))
  diagnostics.withDiagnostics(() => ran.push('core 2'))

  // A module that renders named styles, evaluated while the others load.
  const second = deferred<{ name: string }>()
  const secondLoad = vi.fn(() => second.promise)
  const secondTable = diagnostics.registerDiagnostics<{ name: string }>(undefined, secondLoad)
  secondTable.withDiagnostics(table => ran.push(table.name))
  diagnostics.withDiagnostics(() => ran.push('core 3'))

  first.resolve({ name: 'first' })
  await vi.waitFor(() => expect(secondLoad).toHaveBeenCalledOnce())
  expect(ran).toEqual([])

  second.resolve({ name: 'second' })
  await vi.waitFor(() => expect(ran).toEqual(['core 1', 'first', 'core 2', 'second', 'core 3']))
  expect(firstLoad).toHaveBeenCalledOnce()
  expect(diagnostics.loadedDiagnostics()).toBeDefined()

  // Loaded, a check runs where it is made.
  secondTable.withDiagnostics(table => ran.push(`${table.name} again`))
  expect(ran.at(-1)).toBe('second again')
})

it('reports a table that fails to load once, drops the checks made meanwhile, and loads again when debug mode is turned on again', async () => {
  const diagnostics = await loadInProduction()
  const errors: unknown[][] = []
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => void errors.push(args))
  const attempts = [deferred<{ name: string }>(), deferred<{ name: string }>()]
  let attempt = 0
  const table = diagnostics.registerDiagnostics<{ name: string }>(undefined, () => attempts[attempt++].promise)
  diagnostics.setDebugMode(true)

  const ran: string[] = []
  table.withDiagnostics(() => ran.push('held'))
  attempts[0].reject(new Error('chunk missing'))
  await vi.waitFor(() => expect(errors).toHaveLength(1))
  expect(errors[0][0]).toBe('[MeoNode] Debug mode could not load its diagnostics.')
  expect(String((errors[0][1] as Error).message)).toBe('chunk missing')

  diagnostics.setDebugMode(true)
  table.withDiagnostics(() => ran.push('after'))
  attempts[1].resolve({ name: 'table' })
  await vi.waitFor(() => expect(ran).toEqual(['after']))
  expect(errors).toHaveLength(1)
})

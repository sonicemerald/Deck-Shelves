// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { settings } = vi.hoisted(() => ({ settings: { current: {} as any } }))
vi.mock('../../store/settingsStore', () => ({ getCurrentSettings: () => settings.current }))
vi.mock('../../runtime/host/decky', () => ({ call: async () => null }))

import { resolveShelfAppIds, targetsSteamHidden } from '../../steam'

// 2 is hidden the SteamOS 3.x way, 3 the legacy-bool way.
const APPS = [
  { appid: 1, display_name: 'A', visible_in_game_list: true },
  { appid: 2, display_name: 'B', visible_in_game_list: false },
  { appid: 3, display_name: 'C', is_hidden: true },
  { appid: 4, display_name: 'D' },
]

beforeEach(() => {
  ;(globalThis as any).SteamClient = { Apps: { GetAllAppOverviews: async () => APPS } }
})
afterEach(() => { delete (globalThis as any).SteamClient })

const resolve = (source: any) => resolveShelfAppIds(source, 10, 'alphabetical')

describe('globalHideSteamHidden', () => {
  it('keeps hidden games when the setting is off', async () => {
    settings.current = { globalHideSteamHidden: false }
    expect(await resolve({ type: 'filter', filter: { sort: 'alphabetical' } })).toEqual([1, 2, 3, 4])
  })

  it('drops games hidden in Steam when the setting is on', async () => {
    settings.current = { globalHideSteamHidden: true }
    expect(await resolve({ type: 'filter', filter: { sort: 'alphabetical' } })).toEqual([1, 4])
  })

  it('drops games marked private in Steam when the setting is on', async () => {
    settings.current = { globalHideSteamHidden: true }
    // Mimic Steam's UI: a rendered element whose fiber ancestor is the QueryClientProvider.
    const el = document.createElement('div')
    const client = { getQueryData: (k: string[]) => (k[0] === 'AccountPrivateApps' ? new Set([4]) : undefined) }
    ;(el as any).__reactFiber$test = { memoizedProps: {}, return: { memoizedProps: { client } } }
    document.body.appendChild(el)
    try {
      expect(await resolve({ type: 'filter', filter: { sort: 'alphabetical' } })).toEqual([1])
    } finally { el.remove() }
  })

  it('still shows hidden games on a shelf built to show them', async () => {
    settings.current = { globalHideSteamHidden: true }
    expect(await resolve({ type: 'filter', filter: { hidden: 'only' } })).toEqual([2, 3])
  })
})

describe('targetsSteamHidden', () => {
  it('recognises sources that ask for hidden games', () => {
    expect(targetsSteamHidden({ type: 'tab', tab: 'hidden' })).toBe(true)
    expect(targetsSteamHidden({ type: 'filter', filter: { hidden: 'only' } })).toBe(true)
    expect(targetsSteamHidden({ type: 'filter', filter: { filterGroup: { mode: 'and', items: [{ type: 'hidden', params: { mode: 'only' } }] } } })).toBe(true)
    expect(targetsSteamHidden({ type: 'composite', sources: [{ type: 'collection', collectionId: 'x' }, { type: 'tab', tab: 'hidden' }] })).toBe(true)
  })

  it('ignores everything else', () => {
    expect(targetsSteamHidden({ type: 'tab', tab: 'all' })).toBe(false)
    expect(targetsSteamHidden({ type: 'collection', collectionId: 'favorite' })).toBe(false)
    expect(targetsSteamHidden({ type: 'filter', filter: { filterGroup: { mode: 'and', items: [{ type: 'hidden', params: { mode: 'exclude' } }] } } })).toBe(false)
  })
})

import { EventEmitter } from 'events'
import { describe, expect, it, vi } from 'vitest'
import type { UpdateState } from '../shared/update'
import { createUpdateManager, updateErrorMessage, type UpdaterLike } from './updater'

/** Falešný electron-updater: události vyvoláváme ručně. */
class FakeUpdater extends EventEmitter implements UpdaterLike {
  autoDownload = false
  autoInstallOnAppQuit = false
  allowPrerelease = true
  checks = 0
  installed = 0
  onCheck: () => Promise<unknown> = async () => undefined
  checkForUpdates(): Promise<unknown> {
    this.checks++
    return this.onCheck()
  }
  quitAndInstall(): void {
    this.installed++
  }
}

function setup(
  mode: 'enabled' | 'dev' | 'portable' = 'enabled',
  enabled: boolean | (() => boolean) = true
): { fake: FakeUpdater; states: UpdateState[]; mgr: ReturnType<typeof createUpdateManager> } {
  const fake = new FakeUpdater()
  const states: UpdateState[] = []
  const mgr = createUpdateManager({
    updater: fake,
    mode,
    isEnabled: typeof enabled === 'function' ? enabled : () => enabled,
    onState: (s) => states.push(s),
    startDelayMs: 1000,
    intervalMs: 5000
  })
  return { fake, states, mgr }
}

describe('createUpdateManager', () => {
  it('nastaví stahování na pozadí, instalaci při zavření a žádné předběžné verze', () => {
    const { fake } = setup()
    expect(fake.autoDownload).toBe(true)
    expect(fake.autoInstallOnAppQuit).toBe(true)
    expect(fake.allowPrerelease).toBe(false)
  })

  it('nová verze: hledám → stahuji s procenty → připraveno k instalaci', async () => {
    const { fake, states, mgr } = setup()
    fake.onCheck = async () => {
      fake.emit('checking-for-update')
      fake.emit('update-available', { version: '1.5.1' })
      fake.emit('download-progress', { percent: 42.4 })
      fake.emit('update-downloaded', { version: '1.5.1' })
    }
    await mgr.checkNow()
    expect(states.map((s) => s.status)).toEqual([
      'checking',
      'checking',
      'downloading',
      'downloading',
      'ready'
    ])
    expect(states[3]).toEqual({ status: 'downloading', version: '1.5.1', percent: 42 })
    expect(mgr.getState()).toEqual({ status: 'ready', version: '1.5.1' })
  })

  it('žádná novější verze → aktuální', async () => {
    const { fake, mgr } = setup()
    fake.onCheck = async () => {
      fake.emit('update-not-available', { version: '1.5.0' })
    }
    expect(await mgr.checkNow()).toEqual({ status: 'up-to-date' })
  })

  it('chyba spojení → česká zpráva, žádná výjimka', async () => {
    const { fake, mgr } = setup()
    fake.onCheck = async () => {
      throw new Error('net::ERR_INTERNET_DISCONNECTED')
    }
    const s = await mgr.checkNow()
    expect(s).toMatchObject({ status: 'error', message: expect.stringContaining('připojení') })
  })

  it('opakovaná kontrola za běhu stahování ani při připravené verzi nevolá GitHub znovu', async () => {
    const { fake, mgr } = setup()
    fake.onCheck = async () => {
      fake.emit('update-available', { version: '2.0.0' })
      fake.emit('update-downloaded', { version: '2.0.0' })
    }
    await mgr.checkNow()
    await mgr.checkNow()
    expect(fake.checks).toBe(1)
  })

  it('chyba po stažení nezruší připravenou verzi', async () => {
    const { fake, mgr } = setup()
    fake.onCheck = async () => {
      fake.emit('update-available', { version: '2.0.0' })
      fake.emit('update-downloaded', { version: '2.0.0' })
    }
    await mgr.checkNow()
    fake.emit('error', new Error('ENOTFOUND'))
    expect(mgr.getState()).toEqual({ status: 'ready', version: '2.0.0' })
  })

  it('install restartuje jen když je verze připravená', async () => {
    const { fake, mgr } = setup()
    mgr.install()
    expect(fake.installed).toBe(0)
    fake.onCheck = async () => {
      fake.emit('update-available', { version: '2.0.0' })
      fake.emit('update-downloaded', { version: '2.0.0' })
    }
    await mgr.checkNow()
    mgr.install()
    expect(fake.installed).toBe(1)
  })

  it.each(['dev', 'portable'] as const)('režim %s: nikdy nehledá a hlásí důvod', async (mode) => {
    const { fake, mgr } = setup(mode)
    expect(mgr.getState()).toEqual({ status: 'disabled', reason: mode })
    expect(fake.autoDownload).toBe(false)
    await mgr.checkNow()
    mgr.start()
    expect(fake.checks).toBe(0)
    mgr.install()
    expect(fake.installed).toBe(0)
  })

  it('automatická kontrola: po spuštění a pak v intervalu; vypnutá v Nastavení = nic', async () => {
    vi.useFakeTimers()
    try {
      let enabled = true
      const { fake, mgr } = setup('enabled', () => enabled)
      mgr.start()
      await vi.advanceTimersByTimeAsync(1000)
      expect(fake.checks).toBe(1)
      await vi.advanceTimersByTimeAsync(5000)
      expect(fake.checks).toBe(2)
      enabled = false
      await vi.advanceTimersByTimeAsync(10_000)
      expect(fake.checks).toBe(2)
      // ruční kontrola funguje i při vypnutém automatickém hledání
      await mgr.checkNow()
      expect(fake.checks).toBe(3)
      mgr.stop()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('updateErrorMessage', () => {
  it('rozliší chybějící vydání, síť, kontrolní součet a ostatní', () => {
    expect(updateErrorMessage(new Error('Cannot find latest.yml in the latest release'))).toContain(
      'zatím není žádné vydání'
    )
    expect(updateErrorMessage(new Error('getaddrinfo ENOTFOUND github.com'))).toContain('připojení')
    expect(updateErrorMessage(new Error('sha512 checksum mismatch'))).toContain(
      'kontrolním součtem'
    )
    expect(updateErrorMessage(new Error('něco jiného\ndruhý řádek'))).toBe(
      'Aktualizaci se nepodařilo zkontrolovat: něco jiného'
    )
  })
})

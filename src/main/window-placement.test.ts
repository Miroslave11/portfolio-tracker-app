import { describe, expect, it } from 'vitest'
import { centerOnWorkArea } from './window-placement'

const WINDOW = { width: 1360, height: 860 }

describe('centerOnWorkArea', () => {
  it('okno se vycentruje na pracovní ploše externího displeje (třetí displej vpravo)', () => {
    const r = centerOnWorkArea({ x: 3840, y: 0, width: 1920, height: 1032 }, WINDOW)
    expect(r).toEqual({ x: 3840 + 280, y: 86, width: 1360, height: 860 })
  })

  it('okno zůstane celé uvnitř displeje i při záporných souřadnicích (displej vlevo od hlavního)', () => {
    const area = { x: -1920, y: -200, width: 1920, height: 1032 }
    const r = centerOnWorkArea(area, WINDOW)
    expect(r.x).toBeGreaterThanOrEqual(area.x)
    expect(r.x + r.width).toBeLessThanOrEqual(area.x + area.width)
    expect(r.y).toBeGreaterThanOrEqual(area.y)
    expect(r.y + r.height).toBeLessThanOrEqual(area.y + area.height)
  })

  it('na malém displeji notebooku se okno zmenší, aby se vešlo', () => {
    const r = centerOnWorkArea({ x: 0, y: 0, width: 1280, height: 752 }, WINDOW)
    expect(r).toEqual({ x: 0, y: 0, width: 1280, height: 752 })
  })

  it('nikdy nevrátí nulovou nebo zápornou velikost', () => {
    const r = centerOnWorkArea({ x: 0, y: 0, width: 0, height: 0 }, WINDOW)
    expect(r.width).toBeGreaterThan(0)
    expect(r.height).toBeGreaterThan(0)
  })
})

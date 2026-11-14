import { describe, expect, it } from 'vitest'
import { classifyNetworkError, NetworkError } from './network-error'

/** Chyba ve stylu Node fetch: TypeError „fetch failed“ s příčinou v `cause`. */
function nodeFetchError(code: string): Error {
  return new TypeError('fetch failed', {
    cause: Object.assign(new Error(`getaddrinfo ${code}`), { code })
  })
}

describe('classifyNetworkError', () => {
  it('Node fetch: příčina je v cause, ne v „fetch failed“', () => {
    expect(classifyNetworkError(nodeFetchError('ENOTFOUND')).kind).toBe('offline')
    expect(classifyNetworkError(nodeFetchError('EAI_AGAIN')).kind).toBe('offline')
    expect(classifyNetworkError(nodeFetchError('ECONNREFUSED')).kind).toBe('offline')
    expect(classifyNetworkError(nodeFetchError('UND_ERR_CONNECT_TIMEOUT')).kind).toBe('timeout')
  })

  it('Electron/Chromium: net::ERR_…', () => {
    expect(classifyNetworkError(new TypeError('net::ERR_INTERNET_DISCONNECTED')).kind).toBe(
      'offline'
    )
    expect(classifyNetworkError(new TypeError('net::ERR_NAME_NOT_RESOLVED')).kind).toBe('offline')
    expect(classifyNetworkError(new TypeError('net::ERR_PROXY_CONNECTION_FAILED')).kind).toBe(
      'proxy'
    )
    expect(classifyNetworkError(new TypeError('net::ERR_TIMED_OUT')).kind).toBe('timeout')
    expect(classifyNetworkError(new TypeError('net::ERR_CERT_AUTHORITY_INVALID')).kind).toBe(
      'certificate'
    )
  })

  it('certifikát (antivir / firemní proxy) dostane vysvětlení, co zkontrolovat', () => {
    const info = classifyNetworkError(nodeFetchError('UNABLE_TO_VERIFY_LEAF_SIGNATURE'))
    expect(info.kind).toBe('certificate')
    expect(info.reason).toContain('antivir')
  })

  it('vypršení času (AbortSignal.timeout)', () => {
    const e = new DOMException('The operation was aborted due to timeout', 'TimeoutError')
    expect(classifyNetworkError(e).kind).toBe('timeout')
  })

  it('neznámá chyba ukáže technický detail, ale ne celé „TypeError: “', () => {
    const info = classifyNetworkError(new TypeError('něco divného'))
    expect(info.kind).toBe('other')
    expect(info.reason).toBe('nelze se připojit (něco divného)')
  })

  it('všechny zprávy o spojení začínají „nelze“, ať jsou srozumitelné', () => {
    for (const e of [nodeFetchError('ENOTFOUND'), new Error('x'), 'text', null]) {
      expect(classifyNetworkError(e).reason).toMatch(/^nelze/)
    }
  })
})

describe('NetworkError', () => {
  it('zpráva má název zdroje, reason je bez něj', () => {
    const e = new NetworkError('SXR8.DE', {
      kind: 'offline',
      reason: 'nelze se připojit k internetu'
    })
    expect(e.message).toBe('SXR8.DE: nelze se připojit k internetu')
    expect(e.reason).toBe('nelze se připojit k internetu')
    expect(e.kind).toBe('offline')
  })
})

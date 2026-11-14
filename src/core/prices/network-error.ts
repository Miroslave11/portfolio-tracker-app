export type NetworkErrorKind = 'offline' | 'proxy' | 'timeout' | 'certificate' | 'other'

export interface NetworkErrorInfo {
  kind: NetworkErrorKind
  /** Česky, srozumitelně, bez technického žargonu na začátku. */
  reason: string
}

/** Chyba spojení (ne odpověď serveru): bez internetu, proxy, certifikát, vypršení času. */
export class NetworkError extends Error {
  readonly kind: NetworkErrorKind
  /** Příčina bez předpony (název zdroje), aby šla použít u více zdrojů. */
  readonly reason: string

  constructor(what: string, info: NetworkErrorInfo) {
    super(`${what}: ${info.reason}`)
    this.name = 'NetworkError'
    this.kind = info.kind
    this.reason = info.reason
  }
}

/** Posbírá text chyby včetně vnořených příčin (`cause`) a kódů (ENOTFOUND, net::ERR_…). */
function errorText(err: unknown): string {
  const parts: string[] = []
  let current: unknown = err
  for (let depth = 0; depth < 4 && current; depth++) {
    if (typeof current === 'object') {
      const e = current as { code?: unknown; message?: unknown; name?: unknown; cause?: unknown }
      for (const v of [e.name, e.code, e.message]) if (typeof v === 'string') parts.push(v)
      current = e.cause
    } else {
      parts.push(String(current))
      break
    }
  }
  return parts.join(' | ')
}

const OFFLINE =
  /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ENETUNREACH|EHOSTUNREACH|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ERR_NETWORK_CHANGED|ERR_CONNECTION_(REFUSED|RESET|CLOSED|FAILED)|ERR_ADDRESS_UNREACHABLE|ERR_NETWORK_ACCESS_DENIED|ERR_NETWORK_IO_SUSPENDED/i
const PROXY = /ERR_PROXY_CONNECTION_FAILED|ERR_TUNNEL_CONNECTION_FAILED|ERR_PROXY_/i
const TIMEOUT = /ETIMEDOUT|ERR_TIMED_OUT|UND_ERR_CONNECT_TIMEOUT|TimeoutError|AbortError|timed out/i
const CERTIFICATE =
  /CERT_|UNABLE_TO_VERIFY|SELF_SIGNED|ERR_CERT|ERR_SSL|certificate|DEPTH_ZERO_SELF_SIGNED/i

/** Převede technickou chybu při stahování na srozumitelnou příčinu. */
export function classifyNetworkError(err: unknown): NetworkErrorInfo {
  const text = errorText(err)
  if (PROXY.test(text)) {
    return { kind: 'proxy', reason: 'nelze se připojit přes proxy server' }
  }
  if (CERTIFICATE.test(text)) {
    return {
      kind: 'certificate',
      reason:
        'nelze ověřit zabezpečené spojení (certifikát) – HTTPS možná kontroluje antivir, firewall nebo firemní proxy'
    }
  }
  if (TIMEOUT.test(text)) {
    return { kind: 'timeout', reason: 'nelze se připojit – vypršel čas čekání na server' }
  }
  if (OFFLINE.test(text)) {
    return {
      kind: 'offline',
      reason: 'nelze se připojit k internetu (nebo je server nedostupný)'
    }
  }
  const technical = (text.split(' | ').pop() ?? text).replace(/^TypeError:\s*/, '').slice(0, 120)
  return { kind: 'other', reason: `nelze se připojit (${technical || 'neznámá chyba'})` }
}

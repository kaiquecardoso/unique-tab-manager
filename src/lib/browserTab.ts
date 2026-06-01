export function tabUrlKey(url: string): string {
  try {
    return new URL(url).href
  } catch {
    return url
  }
}

const TRACKING_PARAM_PATTERN =
  /^(utm_|igsh|fbclid|gclid|mc_eid|ref|ref_|spm|si)/i

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^(www\.|m\.)/, '')
}

function stripTrackingSearchParams(url: URL): void {
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAM_PATTERN.test(key)) {
      url.searchParams.delete(key)
    }
  }
}

function normalizePathname(pathname: string): string {
  return (pathname.replace(/\/+$/, '') || '/').toLowerCase()
}

/** Instagram: /reel/id e /reels/id (e params igsh) apontam para o mesmo conteudo. */
function instagramContentKey(url: URL): string | undefined {
  if (normalizeHostname(url.hostname) !== 'instagram.com') return undefined

  const match = url.pathname.match(/^\/(reels?|p|tv)\/([^/?#]+)/i)
  if (!match?.[2]) return undefined

  const segment = match[1].toLowerCase()
  const id = match[2]
  if (segment === 'reel' || segment === 'reels') return `reel:${id}`
  return `${segment}:${id}`
}

/** YouTube: youtu.be/id, watch?v=id, /shorts/id etc. apontam para o mesmo video. */
function youtubeContentKey(url: URL): string | undefined {
  const host = normalizeHostname(url.hostname)
  const isYoutube =
    host === 'youtube.com' ||
    host === 'youtu.be' ||
    host === 'music.youtube.com' ||
    host === 'youtube-nocookie.com'
  if (!isYoutube) return undefined

  if (host === 'youtu.be') {
    const id = url.pathname.replace(/^\/+/, '').split('/')[0]?.split('?')[0]
    if (id) return `video:${id}`
    return undefined
  }

  const watchId = url.searchParams.get('v')
  if (watchId) return `video:${watchId}`

  const pathMatch = url.pathname.match(/^\/(shorts|embed|v|live)\/([^/?#]+)/i)
  if (pathMatch?.[2]) return `video:${pathMatch[2]}`

  return undefined
}

function openTabComparableKey(url: string): string {
  try {
    const parsed = new URL(url)
    stripTrackingSearchParams(parsed)
    parsed.hash = ''

    const igKey = instagramContentKey(parsed)
    if (igKey) return `instagram.com:${igKey}`

    const ytKey = youtubeContentKey(parsed)
    if (ytKey) return `youtube.com:${ytKey}`

    parsed.hostname = normalizeHostname(parsed.hostname)
    const path = normalizePathname(parsed.pathname)
    const search = parsed.searchParams.toString()
    return `${parsed.protocol}//${parsed.hostname}${path}${search ? `?${search}` : ''}`
  } catch {
    return url
  }
}

export function tabUrlsMatch(savedUrl: string, openUrl: string): boolean {
  if (tabUrlKey(savedUrl) === tabUrlKey(openUrl)) return true
  return openTabComparableKey(savedUrl) === openTabComparableKey(openUrl)
}

export async function findOpenBrowserTab(
  url: string,
): Promise<chrome.tabs.Tab | undefined> {
  const tabs = await chrome.tabs.query({})
  const matches = tabs.filter(
    (tab) => typeof tab.url === 'string' && tabUrlsMatch(url, tab.url),
  )
  if (matches.length === 0) return undefined
  return matches.find((tab) => tab.active) ?? matches[0]
}

export async function focusBrowserTab(tab: chrome.tabs.Tab): Promise<void> {
  if (tab.id == null) return
  if (typeof tab.windowId === 'number') {
    await chrome.windows.update(tab.windowId, { focused: true })
  }
  await chrome.tabs.update(tab.id, { active: true })
}

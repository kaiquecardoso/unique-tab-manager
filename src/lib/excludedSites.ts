import { EXCLUDED_SITES_STORAGE_KEY } from './storageKeys'

export { EXCLUDED_SITES_STORAGE_KEY } from './storageKeys'

export function hostnameFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase()
  } catch {
    return null
  }
}

export async function loadExcludedHostnames(): Promise<string[]> {
  const record = await chrome.storage.local.get(EXCLUDED_SITES_STORAGE_KEY)
  const raw = record[EXCLUDED_SITES_STORAGE_KEY]
  if (!Array.isArray(raw)) return []
  return raw.filter((h): h is string => typeof h === 'string' && h.length > 0)
}

export async function isUrlExcluded(url: string): Promise<boolean> {
  const host = hostnameFromUrl(url)
  if (!host) return false
  const list = await loadExcludedHostnames()
  return list.includes(host)
}

export async function isHostnameExcluded(hostname: string): Promise<boolean> {
  const list = await loadExcludedHostnames()
  return list.includes(hostname.toLowerCase())
}

export async function toggleExcludedHostname(
  url: string,
): Promise<{ excluded: boolean; hostname: string | null }> {
  const host = hostnameFromUrl(url)
  if (!host) return { excluded: false, hostname: null }

  const list = await loadExcludedHostnames()
  const index = list.indexOf(host)
  let next: string[]
  let excluded: boolean

  if (index === -1) {
    next = [...list, host]
    excluded = true
  } else {
    next = list.filter((h) => h !== host)
    excluded = false
  }

  await chrome.storage.local.set({ [EXCLUDED_SITES_STORAGE_KEY]: next })
  return { excluded, hostname: host }
}

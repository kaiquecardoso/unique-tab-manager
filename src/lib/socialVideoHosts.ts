function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, '')
}

export function isSocialVideoHostname(hostname: string): boolean {
  const host = normalizeHostname(hostname)
  if (host === 'youtu.be' || host === 'youtube-nocookie.com') return true
  if (host.endsWith('youtube.com')) return true
  if (host === 'instagram.com' || host.endsWith('.instagram.com')) return true
  if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) return true
  return false
}

export function isSocialVideoTabUrl(url: string): boolean {
  try {
    return isSocialVideoHostname(new URL(url).hostname)
  } catch {
    return false
  }
}

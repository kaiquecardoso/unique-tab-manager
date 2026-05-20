/** Detecta URLs em texto corrido (http(s), www. e dominios comuns sem esquema). */
export const URL_IN_TEXT_REGEX =
  /\bhttps?:\/\/[^\s<>"']+|\bwww\.[^\s<>"']+|\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|net|org|gg|io|dev|app|br|tv|me|co|be)(?:\/[^\s<>"']*)?/gi

export function normalizeUrl(raw: string): string {
  const trimmed = raw.replace(/[.,;:!?)]+$/, '')
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/^www\./i.test(trimmed)) return `https://${trimmed}`
  return `https://${trimmed}`
}

export function extractUrlsFromText(text: string): string[] {
  const found: string[] = []
  const seen = new Set<string>()

  for (const match of text.matchAll(URL_IN_TEXT_REGEX)) {
    const raw = match[0]
    if (!raw) continue
    const href = normalizeUrl(raw)
    try {
      const key = new URL(href).href
      if (seen.has(key)) continue
      seen.add(key)
      found.push(href)
    } catch {
      // URL invalida no trecho detectado.
    }
  }

  return found
}

export function extractFirstUrlFromText(text: string): string | undefined {
  return extractUrlsFromText(text)[0]
}

export function linkifyTextElement(element: HTMLElement): boolean {
  if (element.dataset.oneTabLinkified === 'true') return false
  if (element.querySelector('a[data-one-tab-link]')) return false

  const text = element.textContent ?? ''
  if (!text.trim()) return false

  const matches = [...text.matchAll(URL_IN_TEXT_REGEX)]
  if (matches.length === 0) return false

  const fragment = document.createDocumentFragment()
  let lastIndex = 0

  for (const match of matches) {
    const raw = match[0]
    const index = match.index ?? 0
    if (index > lastIndex) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex, index)))
    }

    const anchor = document.createElement('a')
    anchor.href = normalizeUrl(raw)
    anchor.textContent = raw
    anchor.target = '_blank'
    anchor.rel = 'noopener noreferrer'
    anchor.dataset.oneTabLink = 'true'
    anchor.style.color = '#40db6a'
    anchor.style.textDecoration = 'underline'
    anchor.style.wordBreak = 'break-all'

    fragment.appendChild(anchor)
    lastIndex = index + raw.length
  }

  if (lastIndex < text.length) {
    fragment.appendChild(document.createTextNode(text.slice(lastIndex)))
  }

  element.replaceChildren(fragment)
  element.dataset.oneTabLinkified = 'true'
  return true
}

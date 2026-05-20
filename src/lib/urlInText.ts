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

export type LinkifyOptions = {
  /** Destaque verde (usado no LivePix). */
  accent?: boolean
}

function applyOneTabLinkStyles(
  anchor: HTMLAnchorElement,
  options?: LinkifyOptions,
): void {
  anchor.target = '_blank'
  anchor.rel = 'noopener noreferrer'
  anchor.dataset.oneTabLink = 'true'
  if (options?.accent) {
    anchor.style.color = '#40db6a'
    anchor.style.textDecoration = 'underline'
    anchor.style.wordBreak = 'break-all'
  }
}

/** Marca links já presentes no HTML (ex.: PixGG) para rastreamento. */
export function markExistingAnchorsInElement(
  element: HTMLElement,
  options?: LinkifyOptions,
): boolean {
  const anchors = element.querySelectorAll<HTMLAnchorElement>('a[href]')
  if (anchors.length === 0) return false

  for (const anchor of anchors) {
    if (anchor.dataset.oneTabLink === 'true') continue
    try {
      if (!anchor.href) continue
      applyOneTabLinkStyles(anchor, options)
    } catch {
      // href inválido
    }
  }

  element.dataset.oneTabLinkified = 'true'
  return true
}

export function primaryUrlFromMessageElement(
  element: HTMLElement | null,
): string | undefined {
  if (!element) return undefined

  const marked = element.querySelector<HTMLAnchorElement>('a[data-one-tab-link][href]')
  if (marked?.href) {
    try {
      return new URL(marked.href).href
    } catch {
      // segue para texto
    }
  }

  const anyAnchor = element.querySelector<HTMLAnchorElement>('a[href]')
  if (anyAnchor?.href) {
    try {
      return new URL(anyAnchor.href).href
    } catch {
      // segue para texto
    }
  }

  return extractFirstUrlFromText(element.textContent ?? '')
}

export function linkifyTextElement(
  element: HTMLElement,
  options?: LinkifyOptions,
): boolean {
  if (element.dataset.oneTabLinkified === 'true') return false
  if (element.querySelector('a[data-one-tab-link]')) return false

  if (markExistingAnchorsInElement(element, options)) return true

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
    applyOneTabLinkStyles(anchor, options)

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

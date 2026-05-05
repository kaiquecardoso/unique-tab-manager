type SaveLinkMessage = {
  type: 'save-link'
  url: string
  title?: string
}

type ToastMessage = {
  type: 'show-toast'
  message: string
  isError?: boolean
  isLoading?: boolean
  url?: string
}

const TOAST_ID = 'one-tab-manager-toast'

function getAnchorFromTarget(target: EventTarget | null): HTMLAnchorElement | null {
  if (!(target instanceof Element)) return null
  return target.closest('a[href]')
}

function isMacPlatform(): boolean {
  return navigator.platform.toLowerCase().includes('mac')
}

function isShortcutPressed(event: MouseEvent): boolean {
  if (!event.shiftKey) return false
  return isMacPlatform() ? event.metaKey : event.ctrlKey
}

function getDomainFromUrl(url: string | undefined): string {
  if (!url) return ''

  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

function getFaviconUrl(url: string): string {
  const origin = new URL(url).origin
  return `https://www.google.com/s2/favicons?sz=32&domain_url=${encodeURIComponent(origin)}`
}

function showToast(
  message: string,
  isError = false,
  url?: string,
  isLoading = false,
): void {
  const existing = document.getElementById(TOAST_ID)
  if (existing) existing.remove()
  const isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches
  const domain = getDomainFromUrl(url)

  const host = document.createElement('div')
  host.id = TOAST_ID
  host.style.all = 'initial'
  host.style.position = 'fixed'
  host.style.top = '20px'
  host.style.left = '50%'
  host.style.zIndex = '2147483647'
  host.style.pointerEvents = 'none'
  host.style.transform = 'translateX(-50%)'

  const shadow = host.attachShadow({ mode: 'open' })
  const toast = document.createElement('div')
  toast.style.minWidth = '220px'
  toast.style.maxWidth = 'min(420px, calc(100vw - 32px))'
  toast.style.padding = '11px 14px'
  toast.style.border = isDarkMode
    ? '1px solid rgba(255, 255, 255, 0.10)'
    : '1px solid rgba(15, 23, 42, 0.08)'
  toast.style.borderLeft = `3px solid ${isError ? '#ef4444' : '#22c55e'}`
  toast.style.borderRadius = '12px'
  toast.style.background = isDarkMode
    ? 'rgba(24, 24, 27, 0.92)'
    : 'rgba(255, 255, 255, 0.94)'
  toast.style.backdropFilter = 'blur(18px) saturate(140%)'
  toast.style.color = isDarkMode ? '#f4f4f5' : '#18181b'
  toast.style.fontSize = '13px'
  toast.style.fontFamily =
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
  toast.style.fontWeight = '500'
  toast.style.letterSpacing = '0'
  toast.style.textAlign = 'left'
  toast.style.boxShadow = isDarkMode
    ? '0 16px 40px rgba(0, 0, 0, 0.35)'
    : '0 16px 40px rgba(15, 23, 42, 0.14)'
  toast.style.display = 'grid'
  toast.style.gap = domain ? '5px' : '0'
  toast.style.opacity = '0'
  toast.style.transform = 'translateY(-10px) scale(0.98)'
  toast.style.transition =
    'opacity 180ms ease, transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1)'

  const title = document.createElement('div')
  title.style.display = 'flex'
  title.style.alignItems = 'center'
  title.style.gap = '8px'

  if (isLoading) {
    const spinner = document.createElement('span')
    spinner.style.width = '13px'
    spinner.style.height = '13px'
    spinner.style.border = `2px solid ${isDarkMode ? 'rgba(244, 244, 245, 0.25)' : 'rgba(24, 24, 27, 0.18)'}`
    spinner.style.borderTopColor = isDarkMode ? '#f4f4f5' : '#18181b'
    spinner.style.borderRadius = '999px'
    spinner.style.flex = '0 0 auto'
    spinner.style.animation = 'one-tab-manager-spin 720ms linear infinite'
    title.appendChild(spinner)
  }

  const titleText = document.createElement('span')
  titleText.textContent = message
  title.appendChild(titleText)

  const style = document.createElement('style')
  style.textContent = `
    @keyframes one-tab-manager-spin {
      to { transform: rotate(360deg); }
    }
  `

  shadow.appendChild(style)
  toast.appendChild(title)

  if (domain && url) {
    const meta = document.createElement('div')
    meta.style.display = 'flex'
    meta.style.alignItems = 'center'
    meta.style.gap = '6px'
    meta.style.minWidth = '0'
    meta.style.color = isDarkMode ? '#a1a1aa' : '#71717a'
    meta.style.fontSize = '11px'
    meta.style.fontWeight = '400'
    meta.style.lineHeight = '1.2'

    const favicon = document.createElement('img')
    favicon.src = getFaviconUrl(url)
    favicon.alt = ''
    favicon.width = 14
    favicon.height = 14
    favicon.style.width = '14px'
    favicon.style.height = '14px'
    favicon.style.borderRadius = '3px'
    favicon.style.flex = '0 0 auto'

    const domainText = document.createElement('span')
    domainText.textContent = domain
    domainText.style.overflow = 'hidden'
    domainText.style.textOverflow = 'ellipsis'
    domainText.style.whiteSpace = 'nowrap'

    meta.append(favicon, domainText)
    toast.appendChild(meta)
  }

  shadow.appendChild(toast)
  document.documentElement.appendChild(host)
  requestAnimationFrame(() => {
    toast.style.opacity = '1'
    toast.style.transform = 'translateY(0) scale(1)'
  })

  if (!isLoading) {
    window.setTimeout(() => {
      toast.style.opacity = '0'
      toast.style.transform = 'translateY(-10px) scale(0.98)'
      window.setTimeout(() => host.remove(), 180)
    }, 1800)
  }
}

function sendSaveMessage(message: SaveLinkMessage): void {
  chrome.runtime.sendMessage(message, (response?: { ok?: boolean }) => {
    if (chrome.runtime.lastError || !response?.ok) {
      showToast('Nao foi possivel salvar o link', true, message.url)
      return
    }

    showToast('Link salvo no OneTab', false, message.url)
  })
}

chrome.runtime.onMessage.addListener((message: ToastMessage) => {
  if (message?.type !== 'show-toast') return
  showToast(
    message.message,
    Boolean(message.isError),
    message.url,
    Boolean(message.isLoading),
  )
})

document.addEventListener(
  'click',
  (event) => {
    if (event.button !== 0) return
    if (!isShortcutPressed(event)) return

    const anchor = getAnchorFromTarget(event.target)
    if (!anchor) return

    const href = anchor.href
    if (!href) return

    event.preventDefault()
    event.stopPropagation()

    const message: SaveLinkMessage = {
      type: 'save-link',
      url: href,
      title: document.title.trim() || undefined,
    }

    showToast('Salvando link', false, href, true)
    sendSaveMessage(message)
  },
  { capture: true },
)

document.addEventListener(
  'contextmenu',
  (event) => {
    if (!isShortcutPressed(event)) return
    const anchor = getAnchorFromTarget(event.target)
    if (!anchor) return

    event.preventDefault()
    event.stopPropagation()
  },
  { capture: true },
)

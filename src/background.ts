import { loadGroups, saveGroups } from './lib/groupsStorage'
import { calendarDayKey } from './lib/calendarDay'
import type { SavedTab, TabGroup } from './types/tabs'

function isRestrictedUrl(url: string): boolean {
  const u = url.toLowerCase()
  return (
    u.startsWith('chrome://') ||
    u.startsWith('chrome-extension://') ||
    u.startsWith('edge://') ||
    u.startsWith('about:') ||
    u.startsWith('devtools://') ||
    u.startsWith('view-source:')
  )
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms))
}

function normalizeTitle(title: string | undefined): string {
  return title?.trim() || ''
}

function decodeHtmlEntities(value: string): string {
  const entities: Record<string, string> = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  }

  return value.replace(/&(#\d+|#x[\da-f]+|[a-z]+);/gi, (entity, code: string) => {
    if (code.startsWith('#x')) {
      return String.fromCodePoint(Number.parseInt(code.slice(2), 16))
    }

    if (code.startsWith('#')) {
      return String.fromCodePoint(Number.parseInt(code.slice(1), 10))
    }

    return entities[code.toLowerCase()] ?? entity
  })
}

function extractHtmlTitle(html: string): string {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)
  if (!match?.[1]) return ''

  return decodeHtmlEntities(match[1].replace(/\s+/g, ' ').trim())
}

async function resolveLinkedPageTitle(url: string): Promise<string> {
  if (isRestrictedUrl(url)) return ''

  const controller = new AbortController()
  const timeoutId = globalThis.setTimeout(() => controller.abort(), 5000)

  try {
    const response = await fetch(url, {
      credentials: 'omit',
      redirect: 'follow',
      signal: controller.signal,
    })
    const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''

    if (!response.ok || !contentType.includes('text/html')) return ''

    return extractHtmlTitle(await response.text())
  } catch {
    return ''
  } finally {
    globalThis.clearTimeout(timeoutId)
  }
}

function isGenericYoutubeTitle(title: string, url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    if (!host.endsWith('youtube.com') && host !== 'youtu.be') return false
  } catch {
    return false
  }

  return /^\(\d+\)\s+YouTube$/i.test(title) || title.toLowerCase() === 'youtube'
}

async function resolveTabTitle(tab: chrome.tabs.Tab): Promise<string> {
  let bestTitle = normalizeTitle(tab.title)
  if (!tab.id || !tab.url || !isGenericYoutubeTitle(bestTitle, tab.url)) {
    return bestTitle || 'Sem título'
  }

  for (const delay of [150, 250, 400]) {
    await sleep(delay)
    try {
      const freshTab = await chrome.tabs.get(tab.id)
      const freshTitle = normalizeTitle(freshTab.title)
      if (!freshTitle) continue
      bestTitle = freshTitle
      if (!isGenericYoutubeTitle(freshTitle, tab.url)) break
    } catch {
      break
    }
  }

  return bestTitle || 'Sem título'
}

async function saveCurrentTabToStorage(tab: chrome.tabs.Tab): Promise<void> {
  if (!tab.id || !tab.url || isRestrictedUrl(tab.url)) return

  const now = new Date().toISOString()
  const newTab: SavedTab = {
    id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: await resolveTabTitle(tab),
    url: tab.url,
    addedAt: now,
    tags: [],
  }

  const groups = await loadGroups()
  const todayKey = calendarDayKey(new Date())
  const existingIndex = groups.findIndex(
    (g) => calendarDayKey(new Date(g.savedAt)) === todayKey,
  )

  let nextGroups: TabGroup[]

  if (existingIndex !== -1) {
    const target = groups[existingIndex]
    const updated: TabGroup = {
      ...target,
      expanded: true,
      tabs: [newTab, ...target.tabs],
    }
    const without = groups.filter((_, i) => i !== existingIndex)
    nextGroups = [updated, ...without]
  } else {
    const newGroup: TabGroup = {
      id: `g-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      savedAt: new Date().toISOString(),
      expanded: true,
      tabs: [newTab],
    }
    nextGroups = [newGroup, ...groups]
  }

  await saveGroups(nextGroups)
  await chrome.tabs.remove(tab.id)
  await chrome.runtime.openOptionsPage()
}

async function saveLinkToStorage(url: string, title?: string): Promise<void> {
  if (!url || isRestrictedUrl(url)) return

  const linkedPageTitle = await resolveLinkedPageTitle(url)
  const tabTitle = normalizeTitle(linkedPageTitle) || normalizeTitle(title) || url
  const now = new Date().toISOString()
  const newTab: SavedTab = {
    id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: tabTitle,
    url,
    addedAt: now,
    tags: [],
  }

  const groups = await loadGroups()
  const todayKey = calendarDayKey(new Date())
  const existingIndex = groups.findIndex(
    (g) => calendarDayKey(new Date(g.savedAt)) === todayKey,
  )

  let nextGroups: TabGroup[]

  if (existingIndex !== -1) {
    const target = groups[existingIndex]
    const updated: TabGroup = {
      ...target,
      expanded: true,
      tabs: [newTab, ...target.tabs],
    }
    const without = groups.filter((_, i) => i !== existingIndex)
    nextGroups = [updated, ...without]
  } else {
    const newGroup: TabGroup = {
      id: `g-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      savedAt: new Date().toISOString(),
      expanded: true,
      tabs: [newTab],
    }
    nextGroups = [newGroup, ...groups]
  }

  await saveGroups(nextGroups)
}

async function showToastByScript(
  tabId: number,
  message: string,
  isError = false,
  url?: string,
  isLoading = false,
): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (
      toastMessage: string,
      toastIsError: boolean,
      toastUrl?: string,
      toastIsLoading = false,
    ) => {
      const toastId = 'one-tab-manager-toast'
      const existing = document.getElementById(toastId)
      if (existing) existing.remove()
      const isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches
      const domain = (() => {
        if (!toastUrl) return ''

        try {
          return new URL(toastUrl).hostname.replace(/^www\./, '')
        } catch {
          return ''
        }
      })()
      const faviconUrl = (() => {
        if (!toastUrl) return ''

        try {
          const origin = new URL(toastUrl).origin
          return `https://www.google.com/s2/favicons?sz=32&domain_url=${encodeURIComponent(origin)}`
        } catch {
          return ''
        }
      })()

      const host = document.createElement('div')
      host.id = toastId
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
      toast.style.borderLeft = `3px solid ${toastIsError ? '#ef4444' : '#22c55e'}`
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

      if (toastIsLoading) {
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
      titleText.textContent = toastMessage
      title.appendChild(titleText)

      const style = document.createElement('style')
      style.textContent = `
        @keyframes one-tab-manager-spin {
          to { transform: rotate(360deg); }
        }
      `

      shadow.appendChild(style)
      toast.appendChild(title)

      if (domain && faviconUrl) {
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
        favicon.src = faviconUrl
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

      if (!toastIsLoading) {
        window.setTimeout(() => {
          toast.style.opacity = '0'
          toast.style.transform = 'translateY(-10px) scale(0.98)'
          window.setTimeout(() => host.remove(), 180)
        }, 1800)
      }
    },
    args: [message, isError, url, isLoading],
  })
}

async function notifyTabWithToast(
  tabId: number,
  message: string,
  isError = false,
  url?: string,
  isLoading = false,
): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: 'show-toast',
      message,
      isError,
      url,
      isLoading,
    })
    return
  } catch {
    // Fallback para abas onde o content script ainda nao foi injetado.
  }

  try {
    await showToastByScript(tabId, message, isError, url, isLoading)
  } catch {
    // Se for uma pagina restrita, apenas ignora o toast.
  }
}

async function refreshContextMenus(): Promise<void> {
  await chrome.contextMenus.removeAll()
  chrome.contextMenus.create({
    id: 'open-onetab',
    title: 'Abrir lista de abas salvas',
    contexts: ['action'],
  })
  chrome.contextMenus.create({
    id: 'save-link-onetab',
    title: 'Salvar link no OneTab',
    contexts: ['link'],
  })
}

chrome.runtime.onInstalled.addListener(() => {
  void refreshContextMenus()
})

void refreshContextMenus()

chrome.action.onClicked.addListener(() => {
  void (async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (tab) await saveCurrentTabToStorage(tab)
  })()
})

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'open-onetab') {
    void chrome.runtime.openOptionsPage()
    return
  }

  if (info.menuItemId === 'save-link-onetab' && info.linkUrl) {
    const maybeTabTitle = typeof tab?.title === 'string' ? tab.title : ''
    void (async () => {
      try {
        if (typeof tab?.id === 'number') {
          await notifyTabWithToast(tab.id, 'Salvando link', false, info.linkUrl, true)
        }
        await saveLinkToStorage(info.linkUrl!, maybeTabTitle)
        if (typeof tab?.id === 'number') {
          await notifyTabWithToast(tab.id, 'Link salvo no OneTab', false, info.linkUrl)
        }
      } catch {
        if (typeof tab?.id === 'number') {
          await notifyTabWithToast(
            tab.id,
            'Nao foi possivel salvar o link',
            true,
            info.linkUrl,
          )
        }
      }
    })()
  }
})

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'save-link' || typeof message.url !== 'string') return

  void (async () => {
    try {
      const maybeTitle = typeof message.title === 'string' ? message.title : undefined
      await saveLinkToStorage(message.url, maybeTitle)
      sendResponse({ ok: true })
    } catch {
      sendResponse({ ok: false })
    }
  })()

  return true
})

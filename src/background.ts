import { registerAuthTabListener } from './lib/authTabListener'
import { registerOAuthPopupTracking } from './lib/oauthPopup'
import { loadGroups } from './lib/groupsStorage'
import { saveGroupsAndSyncCloud } from './lib/groupsSync'
import { registerRealtimeListeners } from './lib/realtime'

registerAuthTabListener()
registerOAuthPopupTracking()
registerRealtimeListeners()
import { calendarDayKey } from './lib/calendarDay'
import {
  findSavedTabByUrl,
  removeTabFromGroups,
  type SavedTabRef,
} from './lib/savedTabLookup'
import { createTrashedTab } from './lib/trashOps'
import { loadTrash, saveTrash, sortTrashEntries } from './lib/trashStorage'
import {
  showDuplicatePrompt,
  type DuplicatePromptOptions,
  type DuplicateSaveChoice,
} from './lib/duplicatePrompt'
import type { SavedTab, TabGroup } from './types/tabs'

function isDuplicateSaveChoice(value: unknown): value is DuplicateSaveChoice {
  return value === 'keep-new' || value === 'keep-old' || value === 'cancel'
}

type ContextLinkDraft = {
  url: string
  title?: string
  capturedAt: number
}

const contextLinkDrafts = new Map<number, ContextLinkDraft>()

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

function isGenericSiteTitle(title: string, url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    const normalizedTitle = title.replace(/^\(\d+\)\s+/, '').trim().toLowerCase()

    if (host.endsWith('youtube.com') || host === 'youtu.be') {
      return normalizedTitle === 'youtube'
    }

    if (host === 'twitch.tv' || host.endsWith('.twitch.tv')) {
      return normalizedTitle === 'twitch'
    }
  } catch {
    return false
  }

  return false
}

async function getDocumentTitle(tabId: number): Promise<string> {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => document.title,
    })

    return normalizeTitle(result?.result)
  } catch {
    return ''
  }
}

async function resolveLinkedRenderedTitle(
  url: string,
  sourceWindowId?: number,
  sourceTabId?: number,
): Promise<string> {
  if (isRestrictedUrl(url)) return ''

  let tabId: number | undefined

  try {
    const createdTab = await chrome.tabs.create({
      url,
      active: false,
      windowId: sourceWindowId,
    })
    if (!createdTab?.id) return ''

    tabId = createdTab.id

    if (typeof sourceTabId === 'number') {
      void chrome.tabs.update(sourceTabId, { active: true })
    }

    let bestTitle = ''

    for (const delay of [500, 900, 1300, 1800, 2400]) {
      await sleep(delay)

      const linkedTab = await chrome.tabs.get(tabId)
      const documentTitle = await getDocumentTitle(tabId)
      const candidateTitle = documentTitle || normalizeTitle(linkedTab.title)
      if (!candidateTitle) continue

      bestTitle = candidateTitle
      if (!isGenericSiteTitle(candidateTitle, url)) return candidateTitle
    }

    return bestTitle && !isGenericSiteTitle(bestTitle, url) ? bestTitle : ''
  } catch {
    return ''
  } finally {
    if (typeof tabId === 'number') {
      try {
        await chrome.tabs.remove(tabId)
      } catch {
        // A aba auxiliar pode ja ter sido fechada antes do cleanup.
      }
    }
  }
}

async function resolveTabTitle(tab: chrome.tabs.Tab): Promise<string> {
  let bestTitle = normalizeTitle(tab.title)
  if (!tab.id || !tab.url || !isGenericSiteTitle(bestTitle, tab.url)) {
    return bestTitle || 'Sem título'
  }

  for (const delay of [150, 250, 400]) {
    await sleep(delay)
    try {
      const freshTab = await chrome.tabs.get(tab.id)
      const freshTitle = normalizeTitle(freshTab.title)
      const documentTitle = await getDocumentTitle(tab.id)
      const candidateTitle = documentTitle || freshTitle
      if (!candidateTitle) continue
      bestTitle = candidateTitle
      if (!isGenericSiteTitle(candidateTitle, tab.url)) break
    } catch {
      break
    }
  }

  return bestTitle || 'Sem título'
}

function addTabToTodayGroup(groups: TabGroup[], newTab: SavedTab): TabGroup[] {
  const todayKey = calendarDayKey(new Date())
  const existingIndex = groups.findIndex(
    (g) => calendarDayKey(new Date(g.savedAt)) === todayKey,
  )

  if (existingIndex !== -1) {
    const target = groups[existingIndex]
    const updated: TabGroup = {
      ...target,
      expanded: true,
      tabs: [newTab, ...target.tabs],
    }
    const without = groups.filter((_, i) => i !== existingIndex)
    return [updated, ...without]
  }

  const newGroup: TabGroup = {
    id: `g-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    savedAt: new Date().toISOString(),
    expanded: true,
    tabs: [newTab],
  }
  return [newGroup, ...groups]
}

async function runDuplicatePromptInTab(
  tabId: number,
  options: DuplicatePromptOptions,
): Promise<DuplicateSaveChoice | undefined> {
  const targets = [{ tabId }, { tabId, allFrames: true as const }]

  for (const target of targets) {
    try {
      const [viaGlobal] = await chrome.scripting.executeScript({
        target,
        func: (opts: DuplicatePromptOptions) => {
          const fn = (
            globalThis as {
              __OTM_showDuplicatePrompt?: (
                o: DuplicatePromptOptions,
              ) => Promise<DuplicateSaveChoice>
            }
          ).__OTM_showDuplicatePrompt
          return typeof fn === 'function' ? fn(opts) : undefined
        },
        args: [options],
      })
      if (isDuplicateSaveChoice(viaGlobal?.result)) return viaGlobal.result

      const [direct] = await chrome.scripting.executeScript({
        target,
        func: showDuplicatePrompt,
        args: [options],
      })
      if (isDuplicateSaveChoice(direct?.result)) return direct.result
    } catch {
      // Tenta outro alvo (ex.: frame principal vs todos os frames).
    }
  }

  return undefined
}

async function askDuplicateChoice(
  tabId: number,
  options: DuplicatePromptOptions,
): Promise<DuplicateSaveChoice> {
  const injected = await runDuplicatePromptInTab(tabId, options)
  if (isDuplicateSaveChoice(injected)) return injected

  const payload = {
    type: 'duplicate-prompt' as const,
    ...options,
  }

  for (const delay of [0, 120]) {
    if (delay > 0) await sleep(delay)
    try {
      const response = (await chrome.tabs.sendMessage(tabId, payload)) as
        | { choice?: DuplicateSaveChoice }
        | undefined
      if (isDuplicateSaveChoice(response?.choice)) return response.choice
    } catch {
      // Content script pode ainda nao estar pronto.
    }
  }

  return 'cancel'
}

async function trashSavedTabRef(ref: SavedTabRef): Promise<void> {
  const trash = await loadTrash()
  const entry = createTrashedTab(ref.group, ref.tab)
  await saveTrash(sortTrashEntries([entry, ...trash]))
}

async function resolveDuplicateBeforeSave(
  url: string,
  promptTabId: number | undefined,
  newTitle: string | undefined,
): Promise<{ proceed: boolean; groups: TabGroup[] }> {
  const groups = await loadGroups()
  const duplicate = findSavedTabByUrl(groups, url)
  if (!duplicate) return { proceed: true, groups }

  const choice =
    typeof promptTabId === 'number'
      ? await askDuplicateChoice(promptTabId, {
          url,
          existingTitle: duplicate.tab.title,
          existingAddedAt: duplicate.tab.addedAt,
          newTitle,
        })
      : 'cancel'

  if (choice === 'keep-old') {
    if (typeof promptTabId === 'number') {
      await notifyTabWithToast(
        promptTabId,
        'Link já salvo — mantida a mais antiga',
        false,
        url,
        false,
        duplicate.tab.title,
      )
    }
    return { proceed: false, groups }
  }

  if (choice === 'cancel') {
    return { proceed: false, groups }
  }

  await trashSavedTabRef(duplicate)
  return {
    proceed: true,
    groups: removeTabFromGroups(groups, duplicate.tab.id),
  }
}

async function saveCurrentTabToStorage(tab: chrome.tabs.Tab): Promise<void> {
  if (!tab.id || !tab.url || isRestrictedUrl(tab.url)) return

  const preliminaryTitle = normalizeTitle(tab.title) || tab.url
  const { proceed, groups } = await resolveDuplicateBeforeSave(
    tab.url,
    tab.id,
    preliminaryTitle,
  )
  if (!proceed) return

  const tabTitle = await resolveTabTitle(tab)
  const now = new Date().toISOString()
  const newTab: SavedTab = {
    id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: tabTitle,
    url: tab.url,
    addedAt: now,
    tags: [],
  }

  const nextGroups = addTabToTodayGroup(groups, newTab)

  await saveGroupsAndSyncCloud(nextGroups)
  await chrome.tabs.remove(tab.id)
  await chrome.runtime.openOptionsPage()
}

async function saveLinkToStorage(
  url: string,
  title?: string,
  sourceWindowId?: number,
  sourceTabId?: number,
  baseGroups?: TabGroup[],
): Promise<string> {
  if (!url || isRestrictedUrl(url)) return ''

  const normalizedTitle = normalizeTitle(title)
  let groupsAfterDuplicate = baseGroups

  if (!groupsAfterDuplicate) {
    const resolved = await resolveDuplicateBeforeSave(
      url,
      sourceTabId,
      normalizedTitle || url,
    )
    if (!resolved.proceed) return ''
    groupsAfterDuplicate = resolved.groups
  }

  const linkedPageTitle = await resolveLinkedPageTitle(url)
  const normalizedLinkedPageTitle = normalizeTitle(linkedPageTitle)
  const runtimeLinkedTitle =
    !normalizedLinkedPageTitle || isGenericSiteTitle(normalizedLinkedPageTitle, url)
      ? await resolveLinkedRenderedTitle(url, sourceWindowId, sourceTabId)
      : ''
  const tabTitle =
    normalizedLinkedPageTitle && !isGenericSiteTitle(normalizedLinkedPageTitle, url)
      ? normalizedLinkedPageTitle
      : runtimeLinkedTitle || normalizedTitle || normalizedLinkedPageTitle || url
  const now = new Date().toISOString()
  const newTab: SavedTab = {
    id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: tabTitle,
    url,
    addedAt: now,
    tags: [],
  }

  const nextGroups = addTabToTodayGroup(groupsAfterDuplicate, newTab)

  await saveGroupsAndSyncCloud(nextGroups)
  return tabTitle
}

function getContextLinkTitle(tabId: number | undefined, url: string): string | undefined {
  if (typeof tabId !== 'number') return undefined

  const draft = contextLinkDrafts.get(tabId)
  if (!draft || draft.url !== url || Date.now() - draft.capturedAt > 30_000) {
    return undefined
  }

  return draft.title
}

async function showToastByScript(
  tabId: number,
  message: string,
  isError = false,
  url?: string,
  isLoading = false,
  title?: string,
): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (
      toastMessage: string,
      toastIsError: boolean,
      toastUrl?: string,
      toastIsLoading = false,
      toastTitle?: string,
    ) => {
      const toastId = 'one-tab-manager-toast'
      const existing = document.getElementById(toastId)
      if (existing) existing.remove()
      const isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches
      const metaTitle = toastTitle?.replace(/\s+/g, ' ').trim() ?? ''
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
      toast.style.gap = metaTitle ? '5px' : '0'
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

      if (metaTitle) {
        const meta = document.createElement('div')
        meta.style.display = 'flex'
        meta.style.alignItems = 'center'
        meta.style.gap = '6px'
        meta.style.minWidth = '0'
        meta.style.color = isDarkMode ? '#a1a1aa' : '#71717a'
        meta.style.fontSize = '11px'
        meta.style.fontWeight = '400'
        meta.style.lineHeight = '1.2'

        if (faviconUrl) {
          const favicon = document.createElement('img')
          favicon.src = faviconUrl
          favicon.alt = ''
          favicon.width = 14
          favicon.height = 14
          favicon.style.width = '14px'
          favicon.style.height = '14px'
          favicon.style.borderRadius = '3px'
          favicon.style.flex = '0 0 auto'
          meta.appendChild(favicon)
        }

        const tabTitleText = document.createElement('span')
        tabTitleText.textContent = metaTitle
        tabTitleText.style.overflow = 'hidden'
        tabTitleText.style.textOverflow = 'ellipsis'
        tabTitleText.style.whiteSpace = 'nowrap'

        meta.appendChild(tabTitleText)
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
    args: [message, isError, url, isLoading, title],
  })
}

async function notifyTabWithToast(
  tabId: number,
  message: string,
  isError = false,
  url?: string,
  isLoading = false,
  title?: string,
): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: 'show-toast',
      message,
      isError,
      url,
      isLoading,
      title,
    })
    return
  } catch {
    // Fallback para abas onde o content script ainda nao foi injetado.
  }

  try {
    await showToastByScript(tabId, message, isError, url, isLoading, title)
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
    void (async () => {
      try {
        const linkTitle = getContextLinkTitle(tab?.id, info.linkUrl!)
        const preliminaryTitle = linkTitle || info.linkUrl!
        const { proceed, groups } = await resolveDuplicateBeforeSave(
          info.linkUrl!,
          tab?.id,
          preliminaryTitle,
        )
        if (!proceed) return

        if (typeof tab?.id === 'number') {
          void notifyTabWithToast(
            tab.id,
            'Salvando link',
            false,
            info.linkUrl,
            true,
            linkTitle,
          )
        }
        const savedTitle = await saveLinkToStorage(
          info.linkUrl!,
          linkTitle,
          tab?.windowId,
          tab?.id,
          groups,
        )
        if (typeof tab?.id === 'number') {
          await notifyTabWithToast(
            tab.id,
            'Link salvo no OneTab',
            false,
            info.linkUrl,
            false,
            savedTitle,
          )
        }
      } catch {
        if (typeof tab?.id === 'number') {
          await notifyTabWithToast(
            tab.id,
            'Nao foi possivel salvar o link',
            true,
            info.linkUrl,
            false,
          )
        }
      }
    })()
  }
})

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'context-link') {
    if (
      typeof _sender.tab?.id === 'number' &&
      typeof message.url === 'string' &&
      !isRestrictedUrl(message.url)
    ) {
      contextLinkDrafts.set(_sender.tab.id, {
        url: message.url,
        title: typeof message.title === 'string' ? message.title : undefined,
        capturedAt: Date.now(),
      })
    }

    return
  }

  if (message?.type !== 'save-link' || typeof message.url !== 'string') return

  void (async () => {
    try {
      const maybeTitle = typeof message.title === 'string' ? message.title : undefined
      const preliminaryTitle = normalizeTitle(maybeTitle) || message.url
      const { proceed, groups } = await resolveDuplicateBeforeSave(
        message.url,
        _sender.tab?.id,
        preliminaryTitle,
      )
      if (!proceed) {
        sendResponse({ ok: false, skipped: true })
        return
      }

      const savedTitle = await saveLinkToStorage(
        message.url,
        maybeTitle,
        _sender.tab?.windowId,
        _sender.tab?.id,
        groups,
      )
      if (!savedTitle) {
        sendResponse({ ok: false })
        return
      }
      sendResponse({ ok: true, title: savedTitle || maybeTitle })
    } catch {
      sendResponse({ ok: false })
    }
  })()

  return true
})

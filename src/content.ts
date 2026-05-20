import { showDuplicatePrompt } from './lib/duplicatePrompt'
import { showPageToast } from './lib/pageToast'
import { saveLinkFromPage } from './lib/saveLinkFromPage'

;(globalThis as { __OTM_showDuplicatePrompt?: typeof showDuplicatePrompt }).__OTM_showDuplicatePrompt =
  showDuplicatePrompt


type SaveLinkMessage = {
  type: 'save-link'
  url: string
  title?: string
}

type ContextLinkMessage = {
  type: 'context-link'
  url: string
  title?: string
}

type ToastMessage = {
  type: 'show-toast'
  message: string
  isError?: boolean
  isLoading?: boolean
  url?: string
  title?: string
}

type DuplicatePromptMessage = {
  type: 'duplicate-prompt'
  url: string
  existingTitle: string
  existingAddedAt?: string
  newTitle?: string
  batchMode?: boolean
  progress?: { current: number; total: number }
}

let hoveredAnchor: HTMLAnchorElement | null = null

function getAnchorFromTarget(target: EventTarget | null): HTMLAnchorElement | null {
  if (!(target instanceof Element)) return null
  return target.closest('a[href]')
}

function sendSaveMessage(message: SaveLinkMessage): void {
  showPageToast('Salvando link', false, message.url, true, message.title)
  saveLinkFromPage({ url: message.url, title: message.title })
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false

  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  )
}

function isSaveShortcut(event: KeyboardEvent): boolean {
  const key = event.key.toLowerCase()
  const isShiftS =
    event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey && key === 's'
  const isAltS =
    event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey && key === 's'

  return isShiftS || isAltS
}

function getAnchorTitle(anchor: HTMLAnchorElement): string | undefined {
  return (
    anchor.getAttribute('title')?.trim() ||
    anchor.getAttribute('aria-label')?.trim() ||
    anchor.textContent?.replace(/\s+/g, ' ').trim() ||
    undefined
  )
}

function saveLinkFromShortcut(anchor: HTMLAnchorElement): void {
  const href = anchor.href
  if (!href) return

  const message: SaveLinkMessage = {
    type: 'save-link',
    url: href,
    title: getAnchorTitle(anchor),
  }

  showPageToast('Salvando link', false, href, true, message.title)
  sendSaveMessage(message)
}

function reportContextLink(anchor: HTMLAnchorElement): void {
  const message: ContextLinkMessage = {
    type: 'context-link',
    url: anchor.href,
    title: getAnchorTitle(anchor),
  }

  chrome.runtime.sendMessage(message)
}

chrome.runtime.onMessage.addListener(
  (message: ToastMessage | DuplicatePromptMessage, _sender, sendResponse) => {
    if (message?.type === 'show-toast') {
      showPageToast(
        message.message,
        Boolean(message.isError),
        message.url,
        Boolean(message.isLoading),
        message.title,
      )
      return
    }

    if (message?.type === 'duplicate-prompt') {
      void showDuplicatePrompt({
        url: message.url,
        existingTitle: message.existingTitle,
        existingAddedAt: message.existingAddedAt,
        newTitle: message.newTitle,
        batchMode: message.batchMode,
        progress: message.progress,
      }).then((choice) => sendResponse({ choice }))
      return true
    }
  },
)

document.addEventListener(
  'contextmenu',
  (event) => {
    const anchor = getAnchorFromTarget(event.target)
    if (!anchor?.href) return

    reportContextLink(anchor)
  },
  { capture: true },
)

document.addEventListener(
  'pointerover',
  (event) => {
    const anchor = getAnchorFromTarget(event.target)
    if (!anchor) return

    hoveredAnchor = anchor
  },
  { capture: true },
)

document.addEventListener(
  'mousemove',
  (event) => {
    const anchor = getAnchorFromTarget(event.target)
    if (anchor) hoveredAnchor = anchor
  },
  { capture: true },
)

document.addEventListener(
  'pointerout',
  (event) => {
    if (!hoveredAnchor) return
    if (event.relatedTarget instanceof Node && hoveredAnchor.contains(event.relatedTarget)) return

    hoveredAnchor = null
  },
  { capture: true },
)

window.addEventListener(
  'keydown',
  (event) => {
    if (event.repeat) return
    if (!isSaveShortcut(event)) return
    if (isEditableTarget(event.target)) return
    if (!hoveredAnchor) return

    event.preventDefault()
    saveLinkFromShortcut(hoveredAnchor)
  },
  { capture: true },
)

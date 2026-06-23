import { formatSavedAt, t } from '../i18n/core'
import { loadStoredLocale } from '../i18n/getLocale'

export type DuplicateSaveChoice = 'keep-new' | 'keep-old' | 'cancel'

export type DuplicatePromptOptions = {
  url: string
  existingTitle: string
  existingAddedAt?: string
  newTitle?: string
  /** Ex.: { current: 2, total: 5 } em importação em lote */
  progress?: { current: number; total: number }
  /** Cancelar vira "Pular esta aba" e o fluxo segue para a próxima duplicata */
  batchMode?: boolean
}

/**
 * Modal na pagina (DOM direto, sem shadow).
 * Deve ser autocontido para funcionar com chrome.scripting.executeScript.
 */
export async function showDuplicatePrompt(
  options: DuplicatePromptOptions,
): Promise<DuplicateSaveChoice> {
  const locale = await loadStoredLocale()
  const PROMPT_ID = 'unique-tab-manager-duplicate-prompt'

  function normalizeTitle(title: string | undefined): string {
    return title?.replace(/\s+/g, ' ').trim() ?? ''
  }

  function getFaviconUrl(url: string): string {
    try {
      const origin = new URL(url).origin
      return `https://www.google.com/s2/favicons?sz=32&domain_url=${encodeURIComponent(origin)}`
    } catch {
      return ''
    }
  }

  const existing = document.getElementById(PROMPT_ID)
  if (existing) existing.remove()

  const isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches
  const faviconUrl = getFaviconUrl(options.url)
  const existingLabel = normalizeTitle(options.existingTitle) || options.url
  const newLabel = normalizeTitle(options.newTitle)
  const savedAtLabel = formatSavedAt(locale, options.existingAddedAt)
  const multiDuplicateBatch =
    options.batchMode === true && (options.progress?.total ?? 0) > 1

  return new Promise((resolve) => {
    const mountTarget = document.body ?? document.documentElement
    const animMs = 220
    const animEasing = 'cubic-bezier(0.2, 0.8, 0.2, 1)'

    const host = document.createElement('div')
    host.id = PROMPT_ID
    host.setAttribute('data-unique-tab-manager', 'duplicate-prompt')
    host.style.position = 'fixed'
    host.style.top = '0'
    host.style.left = '0'
    host.style.width = '100%'
    host.style.height = '100%'
    host.style.margin = '0'
    host.style.padding = '16px'
    host.style.boxSizing = 'border-box'
    host.style.zIndex = '2147483647'
    host.style.pointerEvents = 'auto'
    host.style.isolation = 'isolate'

    const backdrop = document.createElement('div')
    backdrop.style.position = 'absolute'
    backdrop.style.top = '0'
    backdrop.style.left = '0'
    backdrop.style.width = '100%'
    backdrop.style.height = '100%'
    backdrop.style.background = isDarkMode
      ? 'rgba(0, 0, 0, 0.35)'
      : 'rgba(15, 23, 42, 0.22)'
    backdrop.style.opacity = '0'
    backdrop.style.backdropFilter = 'blur(0px)'
    backdrop.style.setProperty('-webkit-backdrop-filter', 'blur(0px)')
    backdrop.style.transition = `opacity ${animMs}ms ease, backdrop-filter ${animMs}ms ease`

    const panel = document.createElement('div')
    panel.style.position = 'absolute'
    panel.style.top = '50%'
    panel.style.left = '50%'
    panel.style.transform = 'translate(-50%, calc(-50% + 10px)) scale(0.97)'
    panel.style.opacity = '0'
    panel.style.width = 'min(420px, calc(100% - 32px))'
    panel.style.maxHeight = 'calc(100% - 32px)'
    panel.style.overflow = 'auto'
    panel.style.padding = '16px'
    panel.style.transition = `opacity ${animMs}ms ${animEasing}, transform ${animMs}ms ${animEasing}`
    panel.style.border = isDarkMode
      ? '1px solid rgba(255, 255, 255, 0.10)'
      : '1px solid rgba(15, 23, 42, 0.08)'
    panel.style.borderRadius = '14px'
    panel.style.background = isDarkMode
      ? 'rgba(24, 24, 27, 0.98)'
      : 'rgba(255, 255, 255, 0.98)'
    panel.style.color = isDarkMode ? '#f4f4f5' : '#18181b'
    panel.style.fontFamily =
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
    panel.style.boxShadow = isDarkMode
      ? '0 24px 60px rgba(0, 0, 0, 0.45)'
      : '0 24px 60px rgba(15, 23, 42, 0.18)'

    const heading = document.createElement('div')
    heading.textContent =
      multiDuplicateBatch && options.progress
        ? t(locale, 'duplicate.headingProgress', {
            current: options.progress.current,
            total: options.progress.total,
          })
        : t(locale, 'duplicate.heading')
    heading.style.fontSize = '15px'
    heading.style.fontWeight = '600'
    heading.style.margin = '0 0 8px 0'

    const hint = document.createElement('div')
    hint.textContent = multiDuplicateBatch
      ? `${t(locale, 'duplicate.hint')} ${t(locale, 'duplicate.batchHint')}`
      : t(locale, 'duplicate.hint')
    hint.style.fontSize = '13px'
    hint.style.color = isDarkMode ? '#a1a1aa' : '#71717a'
    hint.style.margin = '0 0 14px 0'

    function makeOptionRow(
      label: string,
      title: string,
      subtitle: string | undefined,
      accent: boolean,
    ): HTMLElement {
      const row = document.createElement('div')
      row.style.display = 'flex'
      row.style.alignItems = 'flex-start'
      row.style.gap = '8px'
      row.style.minWidth = '0'
      row.style.marginBottom = '8px'
      row.style.fontSize = '12px'
      row.style.color = isDarkMode ? '#d4d4d8' : '#3f3f46'

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
        favicon.style.marginTop = '2px'
        row.appendChild(favicon)
      }

      const textWrap = document.createElement('div')
      textWrap.style.minWidth = '0'
      textWrap.style.flex = '1'

      const labelRow = document.createElement('div')
      labelRow.style.display = 'flex'
      labelRow.style.gap = '6px'
      labelRow.style.minWidth = '0'

      const tag = document.createElement('span')
      tag.textContent = label
      tag.style.flex = '0 0 auto'
      tag.style.fontWeight = '600'
      tag.style.color = accent
        ? isDarkMode
          ? '#86efac'
          : '#15803d'
        : isDarkMode
          ? '#a1a1aa'
          : '#71717a'

      const titleEl = document.createElement('span')
      titleEl.textContent = title
      titleEl.style.overflow = 'hidden'
      titleEl.style.textOverflow = 'ellipsis'
      titleEl.style.whiteSpace = 'nowrap'
      titleEl.style.minWidth = '0'
      titleEl.style.flex = '1'

      labelRow.appendChild(tag)
      labelRow.appendChild(titleEl)
      textWrap.appendChild(labelRow)

      if (subtitle) {
        const sub = document.createElement('div')
        sub.textContent = subtitle
        sub.style.fontSize = '11px'
        sub.style.color = isDarkMode ? '#71717a' : '#a1a1aa'
        sub.style.marginTop = '2px'
        textWrap.appendChild(sub)
      }

      row.appendChild(textWrap)
      return row
    }

    const actions = document.createElement('div')
    actions.style.display = 'flex'
    actions.style.flexWrap = 'wrap'
    actions.style.gap = '8px'
    actions.style.marginTop = '14px'
    actions.style.justifyContent = 'flex-end'

    function makeButton(
      label: string,
      choice: DuplicateSaveChoice,
      primary = false,
    ): HTMLButtonElement {
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = label
      button.style.border = primary
        ? 'none'
        : isDarkMode
          ? '1px solid rgba(255, 255, 255, 0.14)'
          : '1px solid rgba(15, 23, 42, 0.12)'
      button.style.borderRadius = '8px'
      button.style.padding = '8px 12px'
      button.style.fontSize = '13px'
      button.style.fontWeight = '500'
      button.style.cursor = 'pointer'
      button.style.background = primary
        ? isDarkMode
          ? '#22c55e'
          : '#16a34a'
        : isDarkMode
          ? 'rgba(255, 255, 255, 0.06)'
          : '#f4f4f5'
      button.style.color = primary ? '#ffffff' : isDarkMode ? '#f4f4f5' : '#18181b'
      button.addEventListener('click', () => finish(choice))
      return button
    }

    let finished = false
    function finish(choice: DuplicateSaveChoice): void {
      if (finished) return
      finished = true

      backdrop.style.opacity = '0'
      backdrop.style.backdropFilter = 'blur(0px)'
      backdrop.style.setProperty('-webkit-backdrop-filter', 'blur(0px)')
      panel.style.opacity = '0'
      panel.style.transform = 'translate(-50%, calc(-50% + 10px)) scale(0.97)'

      window.setTimeout(() => {
        host.remove()
        resolve(choice)
      }, animMs)
    }

    panel.appendChild(heading)
    panel.appendChild(hint)
    panel.appendChild(
      makeOptionRow(
        t(locale, 'duplicate.labelOlder'),
        existingLabel,
        savedAtLabel || undefined,
        false,
      ),
    )
    if (newLabel) {
      panel.appendChild(
        makeOptionRow(
          t(locale, 'duplicate.labelNewer'),
          newLabel,
          t(locale, 'duplicate.currentTab'),
          true,
        ),
      )
    }

    actions.appendChild(
      makeButton(
        multiDuplicateBatch
          ? t(locale, 'duplicate.skipThis')
          : t(locale, 'duplicate.cancel'),
        'cancel',
      ),
    )
    actions.appendChild(makeButton(t(locale, 'duplicate.keepOlder'), 'keep-old'))
    actions.appendChild(makeButton(t(locale, 'duplicate.keepNewer'), 'keep-new', true))
    panel.appendChild(actions)

    host.appendChild(backdrop)
    host.appendChild(panel)
    mountTarget.appendChild(host)

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        backdrop.style.opacity = '1'
        backdrop.style.backdropFilter = 'blur(10px)'
        backdrop.style.setProperty('-webkit-backdrop-filter', 'blur(10px)')
        panel.style.opacity = '1'
        panel.style.transform = 'translate(-50%, -50%) scale(1)'
      })
    })

    backdrop.addEventListener('click', () => finish('cancel'))
    window.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'Escape') finish('cancel')
      },
      { once: true },
    )
  })
}

import { detectHostDarkMode } from './pageTheme'

/**
 * Modal na pagina (DOM direto, sem shadow).
 * Pergunta se o usuario quer ir para uma aba ja aberta.
 */
export function showRedirectPrompt(): Promise<boolean> {
  const PROMPT_ID = 'one-tab-manager-redirect-prompt'

  const existing = document.getElementById(PROMPT_ID)
  if (existing) existing.remove()

  const isDarkMode = detectHostDarkMode()

  return new Promise((resolve) => {
    const mountTarget = document.body ?? document.documentElement
    const animMs = 220
    const animEasing = 'cubic-bezier(0.2, 0.8, 0.2, 1)'

    const host = document.createElement('div')
    host.id = PROMPT_ID
    host.setAttribute('data-one-tab-manager', 'redirect-prompt')
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
      ? 'rgba(0, 0, 0, 0.48)'
      : 'rgba(12, 12, 14, 0.12)'
    backdrop.style.opacity = '0'
    backdrop.style.backdropFilter = 'blur(0px)'
    backdrop.style.setProperty('-webkit-backdrop-filter', 'blur(0px)')
    backdrop.style.transition = `opacity ${animMs}ms ease, backdrop-filter ${animMs}ms ease`

    const panel = document.createElement('div')
    panel.style.position = 'absolute'
    panel.style.top = '50%'
    panel.style.left = '50%'
    panel.style.transform = 'translate(-50%, calc(-50% + 10px)) scale(0.96)'
    panel.style.opacity = '0'
    panel.style.width = 'min(400px, calc(100% - 32px))'
    panel.style.maxHeight = 'calc(100% - 32px)'
    panel.style.overflow = 'auto'
    panel.style.padding = '24px 24px 20px'
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
      ? '0 24px 48px rgba(0, 0, 0, 0.5), 0 2px 12px rgba(0, 0, 0, 0.38)'
      : '0 12px 40px rgba(0, 0, 0, 0.14), 0 2px 10px rgba(0, 0, 0, 0.06)'

    const heading = document.createElement('h2')
    heading.textContent = 'Aba já aberta'
    heading.style.fontSize = '16px'
    heading.style.fontWeight = '600'
    heading.style.margin = '0 0 8px 0'
    heading.style.lineHeight = '1.3'

    const body = document.createElement('p')
    body.textContent =
      'Essa aba já está aberta. Deseja ser redirecionado para ela?'
    body.style.fontSize = '14px'
    body.style.color = isDarkMode ? '#a1a1aa' : '#71717a'
    body.style.margin = '0 0 20px 0'
    body.style.lineHeight = '1.5'

    const actions = document.createElement('div')
    actions.style.display = 'flex'
    actions.style.flexWrap = 'wrap'
    actions.style.gap = '8px'
    actions.style.justifyContent = 'flex-end'

    function makeButton(
      label: string,
      primary: boolean,
      onClick: () => void,
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
      button.style.padding = '8px 14px'
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
      button.addEventListener('click', onClick)
      return button
    }

    let finished = false
    function finish(confirmed: boolean): void {
      if (finished) return
      finished = true

      backdrop.style.opacity = '0'
      backdrop.style.backdropFilter = 'blur(0px)'
      backdrop.style.setProperty('-webkit-backdrop-filter', 'blur(0px)')
      panel.style.opacity = '0'
      panel.style.transform = 'translate(-50%, calc(-50% + 10px)) scale(0.96)'

      window.setTimeout(() => {
        host.remove()
        resolve(confirmed)
      }, animMs)
    }

    panel.appendChild(heading)
    panel.appendChild(body)
    actions.appendChild(makeButton('Cancelar', false, () => finish(false)))
    actions.appendChild(
      makeButton('Ir para a aba', true, () => finish(true)),
    )
    panel.appendChild(actions)

    host.appendChild(backdrop)
    host.appendChild(panel)
    mountTarget.appendChild(host)

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        backdrop.style.opacity = '1'
        backdrop.style.backdropFilter = isDarkMode ? 'blur(12px)' : 'blur(12px) saturate(1.08)'
        backdrop.style.setProperty(
          '-webkit-backdrop-filter',
          isDarkMode ? 'blur(12px)' : 'blur(12px) saturate(1.08)',
        )
        panel.style.opacity = '1'
        panel.style.transform = 'translate(-50%, -50%) scale(1)'
      })
    })

    backdrop.addEventListener('click', () => finish(false))
    window.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'Escape') finish(false)
      },
      { once: true },
    )
  })
}

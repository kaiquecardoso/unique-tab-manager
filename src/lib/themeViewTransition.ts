import { flushSync } from 'react-dom'

const THEME_TRANSITION_MS = 500

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function canUseViewTransition(): boolean {
  return typeof document.startViewTransition === 'function'
}

/**
 * Troca o tema com animação circular (View Transitions API).
 * @see https://akashhamirwasia.com/blog/full-page-theme-toggle-animation-with-view-transitions-api/
 */
export async function toggleThemeWithViewTransition(
  applyDarkMode: (nextDark: boolean) => void,
  nextDark: boolean,
  originEl: HTMLElement | null,
): Promise<void> {
  if (!originEl || !canUseViewTransition() || prefersReducedMotion()) {
    applyDarkMode(nextDark)
    return
  }

  await document.startViewTransition(() => {
    flushSync(() => {
      applyDarkMode(nextDark)
    })
  }).ready

  const { top, left, width, height } = originEl.getBoundingClientRect()
  const x = left + width / 2
  const y = top + height / 2
  const right = window.innerWidth - left
  const bottom = window.innerHeight - top
  const maxRadius = Math.hypot(
    Math.max(left, right),
    Math.max(top, bottom),
  )

  document.documentElement.animate(
    {
      clipPath: [
        `circle(0px at ${x}px ${y}px)`,
        `circle(${maxRadius}px at ${x}px ${y}px)`,
      ],
    },
    {
      duration: THEME_TRANSITION_MS,
      easing: 'ease-in-out',
      pseudoElement: '::view-transition-new(root)',
    },
  )
}

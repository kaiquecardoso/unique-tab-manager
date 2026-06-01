function parseRgbLuminance(color: string): number | undefined {
  const match = color.match(
    /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i,
  )
  if (!match) return undefined

  const r = Number(match[1]) / 255
  const g = Number(match[2]) / 255
  const b = Number(match[3]) / 255
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Detecta tema escuro/claro da pagina hospedeira (LivePix, PixGG, etc.). */
export function detectHostDarkMode(): boolean {
  const root = document.documentElement
  const body = document.body

  const muiScheme = root.getAttribute('data-mui-color-scheme')
  if (muiScheme === 'dark') return true
  if (muiScheme === 'light') return false

  const themeAttr =
    root.getAttribute('data-theme') ?? body?.getAttribute('data-theme')
  if (themeAttr === 'dark') return true
  if (themeAttr === 'light') return false

  if (root.classList.contains('dark') || body?.classList.contains('dark')) {
    return true
  }
  if (root.classList.contains('light') || body?.classList.contains('light')) {
    return false
  }

  const colorScheme = getComputedStyle(root).colorScheme
  if (colorScheme === 'dark') return true
  if (colorScheme === 'light') return false

  const bg = getComputedStyle(body ?? root).backgroundColor
  const luminance = parseRgbLuminance(bg)
  if (luminance != null) return luminance < 0.5

  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

import { createLogger, defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.config.ts'

/** CSS do app no head antes do JS — evita primeiro paint sem estilos. */
function stylesheetBeforeModuleScript(): Plugin {
  return {
    name: 'stylesheet-before-module-script',
    transformIndexHtml(html) {
      const sheets = [...html.matchAll(/<link rel="stylesheet"[^>]*>/g)].map(
        (m) => m[0],
      )
      if (!sheets.length) return html
      let next = html
      for (const tag of sheets) {
        next = next.replace(tag, '')
      }
      const block = sheets.join('\n    ')
      next = next.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    ${block}`,
      )
      return next
    },
  }
}

/** Aviso conhecido: @crxjs ainda define rollupOptions; o Vite 8 usa Rolldown. */
const CRX_ROLLUP_ROLLDOWN_WARN =
  /Both `rollupOptions` and `rolldownOptions` were specified by "crx:content-scripts"/

const logger = createLogger()
const warn = logger.warn.bind(logger)
logger.warn = (msg, options) => {
  if (typeof msg === 'string' && CRX_ROLLUP_ROLLDOWN_WARN.test(msg)) return
  warn(msg, options)
}

export default defineConfig({
  customLogger: logger,
  plugins: [react(), crx({ manifest }), stylesheetBeforeModuleScript()],
  build: {
    /* Um único CSS no index.html (link no head) — evita tela branca até o JS injetar estilos. */
    cssCodeSplit: false,
  },
})

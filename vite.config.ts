import { createLogger, defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.config.ts'

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
  plugins: [react(), crx({ manifest })],
})

import { defineManifest } from '@crxjs/vite-plugin'

export default defineManifest({
  manifest_version: 3,
  name: 'One Tab Manager',
  version: '0.0.0',
  description:
    'Ao clicar no ícone, a aba atual é fechada e salva na lista. Gerencie tudo na página de opções.',
  permissions: ['storage', 'tabs', 'contextMenus'],
  background: {
    service_worker: 'src/background.ts',
    type: 'module',
  },
  action: {
    default_title: 'Salvar aba atual no OneTab',
  },
  options_ui: {
    page: 'index.html',
    open_in_tab: true,
  },
})

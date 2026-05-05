import { defineManifest } from '@crxjs/vite-plugin'

export default defineManifest({
  manifest_version: 3,
  name: 'One Tab Manager',
  version: '0.0.0',
  description:
    'Ao clicar no ícone, a aba atual é fechada e salva na lista. Gerencie tudo na página de opções.',
  permissions: ['storage', 'tabs', 'contextMenus', 'scripting', 'activeTab'],
  host_permissions: ['<all_urls>'],
  icons: {
    16: 'src/assets/logo.png',
    32: 'src/assets/logo.png',
    48: 'src/assets/logo.png',
    128: 'src/assets/logo.png',
  },
  background: {
    service_worker: 'src/background.ts',
    type: 'module',
  },
  action: {
    default_title: 'Salvar aba atual no OneTab',
    default_icon: {
      16: 'src/assets/logo.png',
      32: 'src/assets/logo.png',
      48: 'src/assets/logo.png',
      128: 'src/assets/logo.png',
    },
  },
  options_ui: {
    page: 'index.html',
    open_in_tab: true,
  },
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content.ts'],
      all_frames: true,
      run_at: 'document_start',
    },
  ],
})

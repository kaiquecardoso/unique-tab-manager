import { defineManifest } from '@crxjs/vite-plugin'



export default defineManifest({

  manifest_version: 3,

  name: '__MSG_extName__',

  version: '1.2.0',

  description: '__MSG_extDescription__',

  default_locale: 'en',

  permissions: [

    'storage',

    'tabs',

    'windows',

    'contextMenus',

    'scripting',

    'activeTab',

  ],

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

    default_title: '__MSG_actionTitle__',

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

  web_accessible_resources: [

    {

      matches: ['<all_urls>'],

      resources: ['src/assets/logo.png'],

      use_dynamic_url: false,

    },

  ],

})


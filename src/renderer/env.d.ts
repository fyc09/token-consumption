// Type augmentations for Vite-injected globals
/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

import type { Api } from '../preload/index'

declare global {
  interface Window {
    api: Api
  }
}

export {}

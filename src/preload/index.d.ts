import type { KokpitApi } from './index'

declare global {
  interface Window {
    kokpit?: KokpitApi
  }
}

export {}

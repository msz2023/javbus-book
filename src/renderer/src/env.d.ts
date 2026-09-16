/// <reference types="vite/client" />
import type { JavbusApi } from '../../preload/index'

declare global {
  interface Window {
    api: JavbusApi
  }
}

export {}

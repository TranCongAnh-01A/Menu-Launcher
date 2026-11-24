/// <reference types="vite/client" />

interface Window {
  /** Tauri internal bridge — present when running inside Tauri, undefined in the browser. */
  __TAURI_INTERNALS__?: unknown;
}

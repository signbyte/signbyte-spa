/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base path of the portal API (same-origin via the edge; defaults to /api/portal/v1). */
  readonly VITE_API_BASE?: string
  /** Default UI locale (en | lv). */
  readonly VITE_DEFAULT_LOCALE?: string
  /** Comma-separated supported locales. */
  readonly VITE_LOCALES?: string
  /** Product title for the document head/branding. */
  readonly VITE_APP_TITLE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

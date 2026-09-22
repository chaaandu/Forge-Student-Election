/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_NAME?: string;
  readonly VITE_API_BASE_URL?: string;
  /** The Apps Script /exec URL. Set this and the app talks to Google, not Express. */
  readonly VITE_APPS_SCRIPT_URL?: string;
  readonly VITE_KIOSK_TOKEN?: string;
  readonly VITE_CELEBRATION_SECONDS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

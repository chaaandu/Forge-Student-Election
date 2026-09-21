/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_NAME?: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_KIOSK_TOKEN?: string;
  readonly VITE_CELEBRATION_SECONDS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AUTO_SEED_RECORDS?: string;
  readonly VITE_GA_MEASUREMENT_ID?: string;
  /** Production / `vite build`: Umami origin (no trailing slash). No default in app code. */
  readonly VITE_UMAMI_URL?: string;
  /** Production / `vite build`: website UUID from Umami. */
  readonly VITE_UMAMI_WEBSITE_ID?: string;
  /** `vite` dev only: website UUID for local/dev traffic (separate Umami site from prod). */
  readonly VITE_UMAMI_WEBSITE_ID_DEV?: string;
  /** Optional `vite` dev override for Umami origin; if unset, VITE_UMAMI_URL is used. */
  readonly VITE_UMAMI_URL_DEV?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.csv?raw' {
  const content: string;
  export default content;
}

declare module '*.svg?raw' {
  const content: string;
  export default content;
}

declare module '*.yaml?raw' {
  const content: string;
  export default content;
}

declare module '*.yml?raw' {
  const content: string;
  export default content;
}

/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AUTO_SEED_RECORDS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AUTO_SEED_RECORDS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.csv?raw' {
  const content: string;
  export default content;
}

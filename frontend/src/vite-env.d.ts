/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AUTO_SEED_RECORDS?: string;
  readonly VITE_GA_MEASUREMENT_ID?: string;
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

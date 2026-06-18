/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NEOTOMA_API_URL?: string;
  readonly VITE_NEOTOMA_ENV?: "dev" | "prod" | "development" | "production";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WORKTREE_SUFFIX?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface ImportMetaEnv {
  readonly VITE_AUTO_SEED_RECORDS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

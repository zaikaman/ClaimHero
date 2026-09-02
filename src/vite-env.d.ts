/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CONVEX_URL: string;
  readonly VITE_CONVEX_SITE_URL?: string;
  readonly VITE_AGENTMAIL_SENDER_EMAIL?: string;
  readonly VITE_AGENTMAIL_ADJUDICATOR_EMAIL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

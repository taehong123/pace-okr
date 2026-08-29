declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    ASSETS: Fetcher;
    WORKSPACE_AVATARS: R2Bucket;
    OKRPTR_API_TOKEN?: string;
    OKITA_API_TOKEN?: string;
    PACE_API_TOKEN?: string;
  }
}

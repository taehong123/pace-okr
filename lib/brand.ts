export const PRODUCT_NAME = "OKRI";
export const PRODUCT_SLUG = "okri";
export const PUBLIC_APP_URL = "https://okri.ai";
export const LEGACY_PUBLIC_APP_URL = "https://okrptr.com";
export const PUBLIC_MCP_URL = `${PUBLIC_APP_URL}/api/mcp`;

export type BrandRuntimeEnv = {
  OKRI_PUBLIC_URL?: string;
  OKRPTR_PUBLIC_URL?: string;
  OKRI_APP_URL?: string;
  OKRPTR_APP_URL?: string;
};

export function publicAppUrl(runtime?: BrandRuntimeEnv) {
  return String(runtime?.OKRI_PUBLIC_URL || runtime?.OKRI_APP_URL || runtime?.OKRPTR_PUBLIC_URL || runtime?.OKRPTR_APP_URL || PUBLIC_APP_URL).replace(/\/$/, "");
}

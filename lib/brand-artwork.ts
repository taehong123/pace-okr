// Approved OKRI target-and-arrow identity. All exported assets share these outlines.
export const BRAND_ASSET_VERSION = "v1";
export const BRAND_ASSET_ROOT = `/brand/${BRAND_ASSET_VERSION}`;
export const BRAND_INK = "#111111";
export const BRAND_PAPER = "#ffffff";
export const BRAND_SYMBOL_PATH = "M158 50 A86 86 0 1 0 203 96 L178 121 A52 52 0 1 1 134 82 Z M209 27 L228 46 L143 131 L160 148 L105 148 L105 97 L123 115 Z";
export const BRAND_WORDMARK_PATH = "M404 39 C349 39 312 75 312 129 C312 183 349 219 404 219 C459 219 496 183 496 129 C496 75 459 39 404 39 Z M404 75 C436 75 455 96 455 129 C455 162 436 183 404 183 C372 183 353 162 353 129 C353 96 372 75 404 75 Z M519 42 H560 V112 L625 42 H674 L597 125 L679 216 H627 L560 140 V216 H519 Z M690 42 H762 C810 42 838 64 838 102 C838 128 826 147 803 156 L846 216 H798 L761 162 H731 V216 H690 Z M731 77 V127 H758 C784 127 797 120 797 102 C797 84 784 77 758 77 Z M856 42 H896 V216 H856 Z";

export function brandSvg({ lockup = false, reverse = false, maskable = false }: { lockup?: boolean; reverse?: boolean; maskable?: boolean } = {}) {
  const ink = reverse ? BRAND_PAPER : BRAND_INK;
  const paper = reverse ? BRAND_INK : BRAND_PAPER;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lockup ? 896 : 256} 256" role="img" aria-label="OKRI"><rect width="256" height="256" rx="${maskable ? 0 : 56}" fill="${ink}"/><path${maskable ? ' transform="translate(38.4 38.4) scale(.7)"' : ""} d="${BRAND_SYMBOL_PATH}" fill="${paper}"/>${lockup ? `<path d="${BRAND_WORDMARK_PATH}" fill="${ink}" fill-rule="evenodd"/>` : ""}</svg>`;
}

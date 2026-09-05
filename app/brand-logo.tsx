import { BRAND_SYMBOL_PATH, BRAND_WORDMARK_PATH } from "@/lib/brand-artwork";
import styles from "./brand-logo.module.css";

export function BrandLogo({ symbolOnly = false, size = "standard", className = "", decorative = false }: {
  symbolOnly?: boolean;
  size?: "compact" | "standard";
  className?: string;
  decorative?: boolean;
}) {
  return (
    <svg
      className={`${styles.logo} ${symbolOnly ? styles.symbol : styles.lockup} ${size === "compact" ? styles.compact : ""} ${className}`}
      viewBox={`0 0 ${symbolOnly ? 256 : 896} 256`}
      width={symbolOnly ? 256 : 896}
      height={256}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : "OKRI"}
      aria-hidden={decorative || undefined}
      focusable="false"
    >
      <rect className={styles.ink} width="256" height="256" rx="56" />
      <path className={styles.paper} d={BRAND_SYMBOL_PATH} />
      {!symbolOnly && <path className={styles.ink} d={BRAND_WORDMARK_PATH} fillRule="evenodd" />}
    </svg>
  );
}

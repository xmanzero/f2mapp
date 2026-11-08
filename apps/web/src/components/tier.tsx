import type { CSSProperties } from "react";

const VAR: Record<string, string> = { bronze: "bronze", silver: "silver", gold: "gold", platinum: "plat", diamond: "diamond", legend: "legend" };
const LEVEL: Record<string, number> = { bronze: 1, silver: 2, gold: 3, platinum: 4, diamond: 5, legend: 6 };

/** Biến CSS màu hạng: --tier (chữ, viền) và --tier-field (nền thẻ). Theo chế độ Ngày/Đêm. */
export function tierVars(code: string): CSSProperties {
  const v = VAR[code] ?? "silver";
  return { "--tier": `var(--t-${v})`, "--tier-field": `var(--t-${v}-f)` } as CSSProperties;
}

/** Huy hiệu hạng: lục giác, số vạch tăng theo hạng (Đồng 1 vạch … Huyền thoại 6 vạch) */
export function TierEmblem({ code, size = 56, label }: { code: string; size?: number; label: string }) {
  const n = LEVEL[code] ?? 1;
  const top = 26 - (n - 1) * 3.2;
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" role="img" aria-label={`Huy hiệu hạng ${label}`} style={tierVars(code)}>
      <path d="M28 3 L50 15.5 L50 40.5 L28 53 L6 40.5 L6 15.5 Z" fill="var(--tier-field)" stroke="var(--tier)" strokeWidth="2.5" strokeLinejoin="round" />
      {Array.from({ length: n }, (_, i) => {
        const y = top + i * 6.4;
        return <path key={i} d={`M18 ${y + 4} L28 ${y} L38 ${y + 4}`} fill="none" stroke="var(--tier)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />;
      })}
    </svg>
  );
}

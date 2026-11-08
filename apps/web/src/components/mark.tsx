import { useId } from "react";

/**
 * Symbol P của pcdex (PCDEX Brand Kit 1.0, 01_Logo/SVG/PCDEX_Logo_Symbol.svg): chữ P, cung đo hiệu năng có mũi tên, hai ô pixel.
 * Thân chữ P dùng màu chữ (trắng trên nền tối, navy trên nền sáng) — bản gốc trắng sẽ mất trên nền sáng.
 * Không đổi gradient, không kéo méo (quy định của brand kit).
 */
export function Mark({ size = 24, className }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="4 18 214 192" aria-hidden="true" className={className} style={{ flex: "none" }}>
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#20C8FF" /><stop offset=".52" stopColor="#1769FF" /><stop offset="1" stopColor="#8A2BFF" />
        </linearGradient>
      </defs>
      <path d="M26 112 A86 86 0 0 1 188 78" fill="none" stroke={`url(#${id}g)`} strokeWidth="15" strokeLinecap="round" strokeDasharray="16 5" />
      <path d="M184 69 L211 45 L199 88 Z" fill="#8A2BFF" />
      <path d="M54 178 L54 102 Q54 88 69 88 L139 88 Q164 88 164 113 Q164 138 139 138 L92 138 L92 178 Z" fill="var(--logo-ink, currentColor)" />
      <path d="M92 138 L139 138 Q164 138 164 113 Q164 88 139 88" fill="none" stroke="#00A6FF" strokeWidth="8" />
      <path d="M25 164 L42 164 L42 181 L25 181 Z M10 184 L27 184 L27 201 L10 201 Z" fill="#00A6FF" />
    </svg>
  );
}

/** Logo ngang: symbol + chữ PCDEX (EX gradient Tech Blue → Neon Purple). Chữ là phần của logo; trong câu văn vẫn viết "pcdex". */
export function Wordmark({ size = 24 }: { size?: number }) {
  return (
    <span className="wordmark" style={{ fontSize: size * 0.82 }}>
      <Mark size={size} />
      <span className="wordmark-text" aria-hidden="true">PCD<span className="wordmark-ex">EX</span></span>
    </span>
  );
}

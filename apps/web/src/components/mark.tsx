/** Dấu hiệu f2m: ba cột điểm tăng dần — thang hạng của máy. */
export function Mark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="1" y="1" width="22" height="22" rx="6" fill="#24272b" />
      <rect x="6" y="13" width="3" height="5" rx="1" fill="#949494" />
      <rect x="10.5" y="10" width="3" height="8" rx="1" fill="#ffffff" />
      <rect x="15" y="6" width="3" height="12" rx="1" fill="#c6f24e" />
    </svg>
  );
}

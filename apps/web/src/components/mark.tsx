/** Dấu hiệu f2m: ba cột điểm tăng dần — thang hạng của máy. Màu theo chế độ Ngày/Đêm. */
export function Mark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="1" y="1" width="22" height="22" rx="6" fill="var(--raised)" />
      <rect x="6" y="13" width="3" height="5" rx="1" fill="var(--faint)" />
      <rect x="10.5" y="10" width="3" height="8" rx="1" fill="var(--text)" />
      <rect x="15" y="6" width="3" height="12" rx="1" fill="var(--accent)" />
    </svg>
  );
}

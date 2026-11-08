/**
 * Robot mascot của pcdex (PCDEX Brand Kit 1.0, 03_Mascot/PCDEX_Mascot_Master.svg). Nhân vật đồng hành, không thay logo.
 * Dùng ở onboarding, trạng thái trống, hướng dẫn quét, trang lỗi — không rải vào mọi thành phần (brand kit, mục 06).
 * Thuần trang trí: alt rỗng, chữ bên cạnh đã nói đủ.
 */
export function Mascot({ size = 120, className }: { size?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/brand/mascot.svg" alt="" width={size} height={Math.round(size * 650 / 600)} className={className ? `mascot ${className}` : "mascot"} loading="lazy" decoding="async" />
  );
}

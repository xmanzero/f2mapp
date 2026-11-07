export const n0 = (x: number) => Math.round(x).toLocaleString("vi-VN");
export const vnd = (x: number) => `${Math.round(x).toLocaleString("vi-VN")} ₫`;
/** Đổi 0.123 → "+12%", 0 → "0%" */
export const signedPct = (x: number) => {
  const p = Math.round(x * 100);
  return p === 0 ? "0%" : `${p > 0 ? "+" : "−"}${Math.abs(p)}%`;
};
export const ratio = (x: number) => x.toLocaleString("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const STORAGE_LABEL = { hdd: "HDD", sata: "SSD SATA", nvme3: "SSD NVMe Gen3", nvme4: "SSD NVMe Gen4", nvme5: "SSD NVMe Gen5" } as const;
export const RES_LABEL = { 1080: "1080p (Full HD)", 1440: "1440p (2K)", 2160: "2160p (4K)" } as const;

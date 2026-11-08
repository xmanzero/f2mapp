"use client";

import {
  localizePartLabel, partLabel, RESOLUTION_LABEL, tierName, type evaluate, type MachineSpec, type PartKind,
} from "@f2m/shared";
import { Download } from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/i18n/client";
import { exportSheet, type SheetRow } from "@/lib/export-sheet";
import { slugify } from "@/lib/listing-url";
import type { PartView } from "@/lib/use-machine";

/** Màu chữ hạng trên nền sáng (giống chế độ Ngày) */
const TIER_INK: Record<string, string> = { bronze: "#8a4f22", silver: "#4f5b66", gold: "#8a6400", platinum: "#0f6e66", diamond: "#1f5fb8", legend: "#b3262f" };

/** Nút "Xuất ảnh" / "Xuất PDF": phiếu cấu hình có logo và dấu chìm pcdex.app, vẽ ngay trên trình duyệt */
export function ExportMachine({ name, spec, r, parts, handle, account }: {
  name: string; spec: MachineSpec; r: ReturnType<typeof evaluate>; parts: PartView[]; handle: string | null; account: boolean;
}) {
  const { t, n0, ratio, locale, dateTime } = useI18n();
  const T = t.export;
  const [busy, setBusy] = useState<"png" | "pdf" | null>(null);

  const run = async (format: "png" | "pdf") => {
    setBusy(format);
    try {
      const inUse = (k: PartKind) => parts.filter((p) => p.kind === k && p.status === "in_use");
      const ver = (k: PartKind, i = 0): boolean | null => (account ? inUse(k)[i]?.verified ?? false : null);
      const K = t.listing.kind;
      const rows: SheetRow[] = [
        { label: "CPU", value: spec.cpu, verified: ver("cpu") },
        { label: K.gpu!, value: spec.gpu, verified: ver("gpu") },
        { label: K.mainboard!, value: localizePartLabel(partLabel.mainboard(spec.mainboard), locale), verified: ver("mainboard") },
        ...spec.ram.map((k, i) => ({ label: spec.ram.length > 1 ? `RAM ${i + 1}` : "RAM", value: partLabel.ram(k), verified: ver("ram", i) })),
        ...spec.drives.map((dr, i) => ({ label: spec.drives.length > 1 ? `${K.storage} ${i + 1}` : K.storage!, value: partLabel.drive(dr), verified: ver("storage", i) })),
        { label: K.psu!, value: localizePartLabel(partLabel.psu(spec.psu), locale), verified: null },
        { label: t.cfg.screen, value: t.cfg.res[spec.resolution]!, verified: null },
      ];
      const allVerified = account && rows.filter((x) => x.verified !== null).every((x) => x.verified);
      const date = dateTime(Date.now(), { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
      await exportSheet({
        heading: T.heading, machineName: name, date,
        byline: [handle ? `@${handle}` : T.guest, allVerified ? T.allVerified : null].filter(Boolean).join(" · "),
        power: n0(r.scores.power), tierName: t.machine.tier(tierName(r.tier, locale)), tierColor: TIER_INK[r.tier.code] ?? "#0b1530",
        ratio: T.ratio(ratio(r.scores.power / 10000)),
        scores: [[t.machine.gaming, n0(r.scores.gaming)], [t.machine.render, n0(r.scores.render)], [t.machine.ai, n0(r.scores.ai)]],
        fps: r.bottlenecks.map((b) => [`${RESOLUTION_LABEL[b.resolution]} · FPS`, String(Math.round(b.fps))] as [string, string]),
        rows,
        notes: r.findings.filter((f) => f.severity !== "ok").map((f) => f.message),
        text: { score: t.machine.power, fps: "FPS", config: t.machine.config, notes: T.notes, verified: T.verified, declared: T.declared, footer: T.footer, created: T.created },
      }, format, `pcdex-${slugify(name) || "may"}-${new Date().toLocaleDateString("sv-SE")}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <span className="export-btns">
      <button type="button" className="btn small" disabled={!!busy} onClick={() => void run("png")} title={T.pngTip}>
        <Download aria-hidden="true" size={14} /> {busy === "png" ? T.working : T.png}
      </button>
      <button type="button" className="btn small" disabled={!!busy} onClick={() => void run("pdf")} title={T.pdfTip}>
        <Download aria-hidden="true" size={14} /> {busy === "pdf" ? T.working : T.pdf}
      </button>
    </span>
  );
}

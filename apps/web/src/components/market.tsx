"use client";

import { computeScores, findCpu, findGpu, resolveMachine, type MachineConfig } from "@f2m/shared";
import { X } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { CONDITION_LABEL, SAMPLE_LISTINGS, type ListingKind, type SampleListing } from "@/data/sample";
import { n0, signedPct, vnd } from "@/lib/format";
import { useMachine } from "@/lib/use-machine";

const KINDS: [ListingKind | "all", string][] = [["all", "Tất cả"], ["gpu", "Card đồ họa"], ["cpu", "CPU"], ["ram", "RAM"], ["storage", "Ổ SSD"]];
type Sort = "new" | "value" | "gain";
const KIND_ORDER: Record<ListingKind, number> = { gpu: 0, cpu: 1, ram: 2, storage: 3 };
const days = (d: number) => (d === 0 ? "hôm nay" : d === 1 ? "hôm qua" : `${d} ngày trước`);

interface Fit { gain: number | null; note: string }
/** Lắp linh kiện này vào máy của người dùng thì điểm sức mạnh đổi bao nhiêu */
function fitFor(l: SampleListing, mine: MachineConfig | null): Fit {
  if (!mine) return { gain: null, note: "—" };
  const before = computeScores(mine).power;
  if (l.kind === "gpu") {
    const gpu = findGpu(l.part)!;
    return { gain: computeScores({ ...mine, gpu }).power / before - 1, note: "" };
  }
  if (l.kind === "cpu") {
    const cpu = findCpu(l.part)!;
    if (cpu.socket !== mine.cpu.socket) return { gain: null, note: `Khác socket (${cpu.socket})` };
    return { gain: computeScores({ ...mine, cpu }).power / before - 1, note: "" };
  }
  return { gain: null, note: "—" };
}
/** Điểm linh kiện trên mỗi triệu đồng (card: sức mạnh game, CPU: gaming) */
function valueOf(l: SampleListing): number | null {
  const pts = l.kind === "gpu" ? findGpu(l.part)?.raster : l.kind === "cpu" ? findCpu(l.part)?.gaming : undefined;
  return pts ? pts / (l.priceVnd / 1_000_000) : null;
}

export function Market() {
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [kind, setKind] = useState<ListingKind | "all">("all");
  const [sort, setSort] = useState<Sort>("new");
  const { machine, isSample, ready } = useMachine();
  const mine = ready ? resolveMachine(machine) : null;

  const rows = useMemo(() => SAMPLE_LISTINGS.map((l) => ({ l, fit: fitFor(l, mine), value: valueOf(l) })), [mine]);
  const matchQ = (l: SampleListing) => !q || l.part.toLowerCase().includes(q.toLowerCase());
  const scoped = rows.filter((r) => matchQ(r.l));
  const shown = scoped
    .filter((r) => kind === "all" || r.l.kind === kind)
    .sort((a, b) =>
      sort === "new" ? a.l.daysAgo - b.l.daysAgo
      // điểm card và điểm CPU không so được với nhau: nhóm theo loại rồi mới xếp
      : sort === "value" ? KIND_ORDER[a.l.kind] - KIND_ORDER[b.l.kind] || (b.value ?? -1) - (a.value ?? -1)
      : (b.fit.gain ?? -9) - (a.fit.gain ?? -9));

  // Phát hiện: tin tăng điểm máy bạn nhiều nhất trên mỗi triệu đồng
  const best = mine && [...rows].filter((r) => (r.fit.gain ?? 0) > 0.02)
    .sort((a, b) => b.fit.gain! / b.l.priceVnd - a.fit.gain! / a.l.priceVnd)[0];

  return (
    <>
      <div className="title-row">
        <div>
          <h1>Chợ linh kiện</h1>
          <p className="sub">
            {best ? <>Đáng tiền nhất cho máy {isSample ? "mẫu" : "của bạn"}: <b>{best.l.part}</b> {vnd(best.l.priceVnd)}, tăng {Math.round(best.fit.gain! * 100)}% điểm sức mạnh.</>
              : `${SAMPLE_LISTINGS.length} tin rao linh kiện cũ. Giá do người bán đặt.`}
          </p>
        </div>
        <div style={{ display: "grid", justifyItems: "end", gap: 4 }}>
          <button className="btn" disabled aria-describedby="post-why">Đăng tin bán</button>
          <span id="post-why" className="stamp">Cần tài khoản, sắp có</span>
        </div>
      </div>

      <div className="counts" role="group" aria-label="Lọc theo loại linh kiện">
        {KINDS.map(([k, label]) => (
          <button key={k} className="count" aria-pressed={kind === k} onClick={() => setKind(k)}>
            <span className="label">{label}</span>
            <span className="value num">{scoped.filter((r) => k === "all" || r.l.kind === k).length}</span>
          </button>
        ))}
      </div>

      <section className="panel" aria-labelledby="h-list">
        <header>
          <h2 id="h-list">{KINDS.find((k) => k[0] === kind)![1]} · <span className="num">{shown.length}</span> tin</h2>
          <span className="meta">Tin mẫu</span>
        </header>
        <div className="toolbar">
          <div className="segmented" role="group" aria-label="Sắp xếp">
            {([["new", "Mới nhất"], ["value", "Đáng tiền"], ["gain", "Tăng điểm máy tôi"]] as const).map(([k, l]) => (
              <button key={k} aria-pressed={sort === k} onClick={() => setSort(k)}>{l}</button>
            ))}
          </div>
          <span className="spacer" />
          {q && (
            <button className="btn small" onClick={() => setQ("")}>
              Tìm “{q}” <X size={14} aria-hidden="true" /><span className="sr-only">Bỏ tìm</span>
            </button>
          )}
        </div>

        {shown.length === 0 ? (
          <p className="empty">Không có tin nào khớp “{q}”{kind !== "all" ? " trong mục này" : ""}.</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Linh kiện</th>
                  <th className="r">Giá</th>
                  <th className="r hide-sm">Điểm / triệu</th>
                  <th className="r">Lắp vào máy {isSample ? "mẫu" : "bạn"}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map(({ l, fit, value }) => (
                  <tr key={l.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 500 }}>{l.part}</span>
                        <span className={`pill ${l.condition === "like_new" ? "pos" : ""}`}>{CONDITION_LABEL[l.condition]}</span>
                      </div>
                      <div className="faint" style={{ fontSize: 13, marginTop: 2 }}>
                        {l.province} · {l.seller} · {days(l.daysAgo)}{l.warrantyMonths > 0 ? ` · bảo hành ${l.warrantyMonths} tháng` : ""}
                      </div>
                    </td>
                    <td className="r num" style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{vnd(l.priceVnd)}</td>
                    <td className="r num hide-sm">{value === null ? <span className="faint">—</span> : n0(value)}</td>
                    <td className="r num" style={{ whiteSpace: "nowrap" }}>
                      {fit.gain === null ? <span className="faint">{fit.note}</span>
                        : <span style={{ color: fit.gain > 0.005 ? "var(--positive)" : "var(--faint)", fontWeight: 500 }}>{signedPct(fit.gain)} điểm</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="faint" style={{ fontSize: 12, marginTop: 12 }}>
          “Lắp vào máy” tính theo cấu hình ở <Link href="/" style={{ textDecoration: "underline", textUnderlineOffset: 3 }}>Máy của tôi</Link>. Điểm / triệu: điểm linh kiện (card: sức mạnh game, CPU: gaming) chia cho giá.
        </p>
      </section>
    </>
  );
}

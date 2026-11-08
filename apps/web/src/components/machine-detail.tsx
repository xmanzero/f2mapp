"use client";

import {
  evaluate, partLabel, resolveMachine, RESOLUTION_LABEL, specFromInput, specToInput,
  type MachineInput, type MachineSpec, type PartKind,
} from "@f2m/shared";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { n0, ratio } from "@/lib/format";
import { partsFromSpec, type PartView } from "@/lib/use-machine";
import { MachineDiagram } from "./machine-diagram";
import { TierEmblem, tierVars } from "./tier";

/** Một dòng trên bảng xếp hạng được mở ra xem chi tiết */
export interface DetailTarget {
  name: string; sub: string; initial: string; tint: string; rank: number; me: boolean;
  /** máy thật trên tài khoản: tải cấu hình chi tiết từ API */
  userId: string | null;
  /** máy mẫu / máy trên trình duyệt: cấu hình tóm tắt có sẵn */
  machine: MachineInput | null;
}

interface PublicMachine {
  spec: MachineSpec; lastScanAt: string | null;
  parts: { kind: PartKind; label: string; verified: boolean }[];
}

/** Bảng chi tiết máy: điểm, Gaming / Đồ họa / AI, FPS theo màn hình, huy hiệu, cấu hình đầy đủ, sơ đồ máy */
export function MachineDetail({ target, myPower, onClose }: { target: DetailTarget | null; myPower: number | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<PublicMachine | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (target && !d.open) d.showModal();
    if (!target && d.open) d.close();
  }, [target]);

  useEffect(() => {
    setData(null); setError(null);
    if (!target) return;
    if (target.machine) {
      const spec = specFromInput(target.machine);
      setData({ spec, lastScanAt: null, parts: partsFromSpec(spec).map((p) => ({ kind: p.kind, label: p.label, verified: false })) });
    } else if (target.userId) {
      let live = true;
      api<PublicMachine>(`/v1/leaderboard/${target.userId}`).then((r) => live && setData(r)).catch((e: Error) => live && setError(e.message || "Không tải được máy"));
      return () => { live = false; };
    }
  }, [target]);

  return (
    <dialog ref={ref} className="sheet" aria-labelledby="h-detail" onClose={onClose}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      {target && (
        <div className="sheet-body">
          <header className="sheet-head">
            <span className="avatar" style={{ background: target.tint }} aria-hidden="true">{target.initial}</span>
            <div style={{ minWidth: 0 }}>
              <h2 id="h-detail">{target.name}</h2>
              <div className="faint" style={{ fontSize: 13 }}>{target.sub}</div>
            </div>
            <button className="icon-btn" onClick={onClose} aria-label="Đóng"><X aria-hidden="true" /></button>
          </header>
          {error ? <p className="empty">{error}</p>
            : !data ? <div aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 56, marginTop: 10 }} />)}</div>
            : <Body target={target} data={data} myPower={myPower} />}
        </div>
      )}
    </dialog>
  );
}

function Body({ target, data, myPower }: { target: DetailTarget; data: PublicMachine; myPower: number | null }) {
  const { spec } = data;
  const cfg = resolveMachine(specToInput(spec));
  const r = evaluate(cfg);
  const s = r.scores;
  const isReal = !!target.userId;
  const verifiedKinds = (kind: PartKind) => data.parts.filter((p) => p.kind === kind);
  const ok = (kind: PartKind, i = 0) => verifiedKinds(kind)[i]?.verified ?? false;
  const allVerified = isReal && data.parts.filter((p) => p.kind !== "psu").length > 0 && data.parts.filter((p) => p.kind !== "psu").every((p) => p.verified);
  const views: PartView[] = data.parts.map((p) => ({ id: null, kind: p.kind, label: p.label, status: "in_use", verified: p.verified, listingId: null, addedAt: null }));
  const diff = myPower && !target.me ? s.power / myPower - 1 : null;

  const rows: { kind: PartKind; label: string; value: string; verified: boolean }[] = [
    { kind: "cpu", label: "CPU", value: spec.cpu, verified: ok("cpu") },
    { kind: "gpu", label: "Card đồ họa", value: spec.gpu, verified: ok("gpu") },
    { kind: "mainboard", label: "Mainboard", value: partLabel.mainboard(spec.mainboard), verified: ok("mainboard") },
    ...spec.ram.map((k, i) => ({ kind: "ram" as const, label: "RAM", value: partLabel.ram(k), verified: ok("ram", i) })),
    ...spec.drives.map((d, i) => ({ kind: "storage" as const, label: "Ổ cứng", value: partLabel.drive(d) + (d.healthPct != null ? ` · sức khỏe ${d.healthPct}%` : ""), verified: ok("storage", i) })),
    { kind: "psu", label: "Nguồn", value: partLabel.psu(spec.psu), verified: false },
  ];

  return (
    <>
      <section className="detail-score" style={tierVars(r.tier.code)}>
        <TierEmblem code={r.tier.code} label={r.tier.name} />
        <div>
          <div className="answer num tier-ink">{n0(s.power)}</div>
          <div className="tier-name">Hạng {r.tier.name} · #{target.rank}</div>
        </div>
        <div className="detail-tags">
          {isReal && <span className={`pill ${allVerified ? "pos" : ""}`}>{allVerified ? "Xác thực đang dùng" : "Chưa xác thực"}</span>}
          {!isReal && !target.me && <span className="pill">Máy mẫu</span>}
          <span className="faint" style={{ fontSize: 13 }}>Gấp <span className="num">{ratio(s.power / 10000)}</span> lần máy mốc</span>
          {diff !== null && (
            <span className={`pill ${diff >= 0 ? "" : "pos"}`}>
              {Math.abs(diff) < 0.01 ? "Ngang máy bạn" : diff > 0 ? `Mạnh hơn máy bạn ${Math.round(diff * 100)}%` : `Máy bạn mạnh hơn ${Math.round((1 / (1 + diff) - 1) * 100)}%`}
            </span>
          )}
        </div>
      </section>

      <div className="strip well">
        {([["gaming", "Gaming"], ["render", "Đồ họa"], ["ai", "AI"]] as const).map(([k, l]) => (
          <div key={k}><div className="label">{l}</div><div className="value num">{n0(s[k])}</div></div>
        ))}
      </div>

      <h3 className="sheet-h">Khung hình game AAA, thiết lập Ultra</h3>
      <ul className="detail-fps">
        {r.bottlenecks.map((b) => (
          <li key={b.resolution} className={b.resolution === spec.resolution ? "current" : undefined}>
            <span>{RESOLUTION_LABEL[b.resolution]}{b.resolution === spec.resolution && <small> · màn hình đang dùng</small>}</span>
            <b className="num">{Math.round(b.fps)} <small>FPS</small></b>
            <span className="faint">{b.loss <= 0.1 ? "Cân bằng" : b.side === "cpu" ? `CPU nghẽn ${Math.round(b.loss * 100)}%` : "Card chạy hết"}</span>
          </li>
        ))}
      </ul>

      <div className="detail-split">
        <div>
          <h3 className="sheet-h">Cấu hình</h3>
          <dl className="detail-spec">
            {rows.map((row, i) => (
              <div key={i}>
                <dt>{row.label}</dt>
                <dd>
                  <span>{row.value}</span>
                  {isReal && row.verified && <span className="pill pos">Xác thực</span>}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <figure className="score-figure">
          <MachineDiagram spec={spec} parts={views} />
          <figcaption className="faint">Sơ đồ máy{isReal ? " · viền xanh = xác thực đang dùng" : ""}</figcaption>
        </figure>
      </div>

      {r.badges.length > 0 && (
        <>
          <h3 className="sheet-h">Huy hiệu</h3>
          <ul className="badges" style={{ marginTop: 0 }}>
            {r.badges.map((b) => <li key={b.code}><span className="pill pos">{b.name}</span><span className="faint">{b.description}</span></li>)}
          </ul>
        </>
      )}
    </>
  );
}

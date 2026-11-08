"use client";

import { CPUS, GPUS, partLabel, specFromInput, type MachineInput, type MachineSpec } from "@f2m/shared";
import Link from "next/link";
import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { RES_LABEL, STORAGE_LABEL } from "@/lib/format";
import { Combo } from "./combo";

const RAM_TOTAL = [4, 8, 12, 16, 24, 32, 48, 64, 96, 128];
const PSU = [300, 350, 400, 450, 500, 550, 600, 650, 700, 750, 850, 1000, 1200, 1300, 1600];
const CPU_OPTIONS = CPUS.map((c) => ({ value: c.name, label: c.name, hint: c.socket }));
const GPU_OPTIONS = GPUS.map((g) => ({ value: g.name, label: g.name, hint: g.integrated ? "tích hợp" : `${g.vramGb} GB` }));

type Draft = { [K in keyof MachineInput]: string };
const BLANK: Draft = { cpu: "", gpu: "", ramGb: "", ramChannels: "", storage: "", pcieGen: "", psuW: "", resolution: "" };

/**
 * Tài khoản chưa có máy (hoặc đang thêm máy thứ hai): không gán máy mẫu.
 * Người dùng quét bằng pcdex-scan, hoặc tự chọn từng linh kiện; chỉ lưu khi đã chọn đủ.
 */
export function NewMachine({ name, first, browserSpec, onCreated, onCancel }: {
  name: string; first: boolean; browserSpec: MachineSpec | null;
  onCreated: () => Promise<unknown>; onCancel?: () => void;
}) {
  const [d, setD] = useState<Draft>(BLANK);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof Draft) => (v: string) => setD((x) => ({ ...x, [k]: v }));
  const left = (Object.keys(BLANK) as (keyof Draft)[]).filter((k) => !d[k]).length;

  const create = async (spec: MachineSpec) => {
    setBusy(true); setError(null);
    try { await api("/v1/me/machines", { method: "POST", body: { name, spec } }); await onCreated(); }
    catch (e) { setError((e as ApiError).message); setBusy(false); }
  };
  const submit = () => {
    if (left) return;
    void create(specFromInput({
      cpu: d.cpu, gpu: d.gpu, ramGb: Number(d.ramGb), ramChannels: Number(d.ramChannels) as 1 | 2, storage: d.storage as MachineInput["storage"],
      pcieGen: Number(d.pcieGen) as 3 | 4 | 5, psuW: Number(d.psuW), resolution: Number(d.resolution) as MachineInput["resolution"],
    }));
  };

  return (
    <>
      <div className="title-row">
        <div>
          <h1>{first ? "Máy của tôi" : `Thêm ${name.toLowerCase()}`}</h1>
          <p className="sub">{first ? "Tài khoản chưa có máy nào. Quét máy hoặc tự chọn linh kiện để xem điểm, FPS và gợi ý nâng cấp." : "Quét máy đó bằng pcdex-scan, hoặc tự chọn linh kiện."}</p>
        </div>
        {onCancel && <button type="button" className="btn small" onClick={onCancel}>Hủy</button>}
      </div>

      <div className="new-machine">
        <section className="panel nm-scan" aria-labelledby="h-nm-scan">
          <h2 id="h-nm-scan">Quét bằng pcdex-scan</h2>
          <p className="muted">Phần mềm 48 KB cho Windows, không cần cài. Đọc CPU, card, mainboard, RAM, ổ cứng trong vài giây; linh kiện quét được có nhãn “Xác thực đang dùng”.</p>
          <ol className="nm-steps">
            <li>Tải và chạy pcdex-scan trên máy cần khai.</li>
            <li>Bấm “Gắn vào tài khoản”, phần mềm hiện mã và mã QR.</li>
            <li>Nhập mã ở trang Quét, chọn tạo máy mới.</li>
          </ol>
          <div className="nm-actions">
            <a href="/tai/pcdex-scan.exe" download className="btn primary">Tải pcdex-scan</a>
            <Link href="/quet" className="btn">Đã có mã quét</Link>
          </div>
          {browserSpec && (
            <div className="nm-browser">
              <p>Trình duyệt này còn cấu hình bạn đã khai khi chưa đăng nhập: <b>{browserSpec.cpu}</b>, <b>{browserSpec.gpu}</b>, {partLabel.ram(browserSpec.ram[0]!)}.</p>
              <button type="button" className="btn small" disabled={busy} onClick={() => void create(browserSpec)}>Dùng cấu hình này</button>
            </div>
          )}
        </section>

        <section className="panel" aria-labelledby="h-nm-manual">
          <h2 id="h-nm-manual">Tự chọn linh kiện</h2>
          <form className="form nm-form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
            <div className="field">
              <label htmlFor="nm-cpu">CPU</label>
              <Combo id="nm-cpu" value={d.cpu} onChange={set("cpu")} options={CPU_OPTIONS} placeholder="Gõ tên, VD: 12400F" />
            </div>
            <div className="field">
              <label htmlFor="nm-gpu">Card đồ họa</label>
              <Combo id="nm-gpu" value={d.gpu} onChange={set("gpu")} options={GPU_OPTIONS} placeholder="Gõ tên, VD: 4060" />
              <span className="hint">Không có card rời thì chọn đồ họa tích hợp của CPU.</span>
            </div>
            <div className="nm-pair">
              <Pick id="nm-ram" label="RAM tổng" value={d.ramGb} onChange={set("ramGb")} options={RAM_TOTAL.map((n) => [String(n), `${n} GB`])} />
              <Pick id="nm-ch" label="Số thanh RAM" value={d.ramChannels} onChange={set("ramChannels")} options={[["1", "1 thanh"], ["2", "2 thanh trở lên"]]} />
            </div>
            <div className="nm-pair">
              <Pick id="nm-drive" label="Ổ cài Windows" value={d.storage} onChange={set("storage")} options={Object.entries(STORAGE_LABEL)} />
              <Pick id="nm-pcie" label="Khe card trên mainboard" value={d.pcieGen} onChange={set("pcieGen")} options={[3, 4, 5].map((g) => [String(g), `PCIe ${g}.0`])} />
            </div>
            <div className="nm-pair">
              <Pick id="nm-psu" label="Nguồn" value={d.psuW} onChange={set("psuW")} options={PSU.map((w) => [String(w), `${w} W`])} />
              <Pick id="nm-res" label="Màn hình chơi game" value={d.resolution} onChange={set("resolution")} options={Object.entries(RES_LABEL)} />
            </div>
            <p className="hint muted">Sau khi lưu, bạn thêm chi tiết (model mainboard, từng bộ RAM, nhiều ổ, chuẩn nguồn) ở phần Cấu hình.</p>
            <button className="btn primary nm-go" disabled={left > 0 || busy}>
              {busy ? "Đang lưu…" : left ? `Còn ${left} mục chưa chọn` : "Lưu máy và xem điểm"}
            </button>
            {error && <p className="form-error" role="alert">{error}</p>}
          </form>
        </section>
      </div>
    </>
  );
}

function Pick({ id, label, value, onChange, options }: {
  id: string; label: string; value: string; onChange: (v: string) => void; options: readonly (readonly [string, string])[];
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} className={`input${value ? "" : " unset"}`} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="" disabled>Chọn…</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}

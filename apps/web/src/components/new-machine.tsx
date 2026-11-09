"use client";

import { useI18n } from "@/i18n/client";
import { machineName } from "@/lib/use-machine";

import { CPUS, GPUS, partLabel, specFromInput, type MachineInput, type MachineSpec } from "@f2m/shared";
import Link from "next/link";
import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { Combo } from "./combo";
import { Mascot } from "./mascot";

const RAM_TOTAL = [4, 8, 12, 16, 24, 32, 48, 64, 96, 128];
const PSU = [300, 350, 400, 450, 500, 550, 600, 650, 700, 750, 850, 1000, 1200, 1300, 1600];

type Draft = { [K in keyof MachineInput]: string };
const BLANK: Draft = { cpu: "", gpu: "", ramGb: "", ramChannels: "", storage: "", pcieGen: "", psuW: "", resolution: "" };

/**
 * Tài khoản chưa có máy (hoặc đang thêm máy thứ hai): không gán máy mẫu.
 * Người dùng quét bằng pcdex-scan, hoặc tự chọn từng linh kiện; chỉ lưu khi đã chọn đủ.
 */
export function NewMachine({ name, first, browserSpec, onCreated, onCancel, laptop: initialLaptop = false }: {
  name: string; first: boolean; browserSpec: MachineSpec | null; laptop?: boolean;
  onCreated: () => Promise<unknown>; onCancel?: () => void;
}) {
  const { t, p, locale } = useI18n();
  const T = t.newMachine;
  const [laptop, setLaptop] = useState(initialLaptop);
  // laptop: CPU / card bản laptop + đồ họa tích hợp; máy bàn: không có bản laptop
  const CPU_OPTIONS = CPUS.filter((c) => !!c.mobile === laptop).map((c) => ({ value: c.name, label: c.name, hint: laptop ? "" : c.socket }));
  const GPU_OPTIONS = GPUS.filter((g) => (laptop ? g.mobile || g.integrated : !g.mobile))
    .map((g) => ({ value: g.name, label: g.name, hint: g.integrated ? T.integrated : `${g.vramGb} GB` }));
  const shown = machineName(name, locale);
  const [d, setD] = useState<Draft>(BLANK);
  const [tgpW, setTgpW] = useState<number | null>(null);
  const [model, setModel] = useState("");
  const tgp = GPUS.find((g) => g.name === d.gpu)?.tgp ?? null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof Draft) => (v: string) => setD((x) => ({ ...x, [k]: v }));
  // laptop không hỏi khe PCIe và nguồn (card hàn trên bo, sạc không tính điểm)
  const need = (Object.keys(BLANK) as (keyof Draft)[]).filter((k) => !laptop || (k !== "pcieGen" && k !== "psuW"));
  const left = need.filter((k) => !d[k]).length;
  const switchType = (v: boolean) => { setLaptop(v); setD((x) => ({ ...x, cpu: "", gpu: "" })); setTgpW(null); };

  const create = async (spec: MachineSpec) => {
    setBusy(true); setError(null);
    try { await api("/v1/me/machines", { method: "POST", body: { name, spec } }); await onCreated(); }
    catch (e) { setError((e as ApiError).message); setBusy(false); }
  };
  const submit = () => {
    if (left) return;
    const spec = specFromInput({
      cpu: d.cpu, gpu: d.gpu, ramGb: Number(d.ramGb), ramChannels: Number(d.ramChannels) as 1 | 2, storage: d.storage as MachineInput["storage"],
      pcieGen: laptop ? 4 : Number(d.pcieGen) as 3 | 4 | 5, psuW: laptop ? 180 : Number(d.psuW), resolution: Number(d.resolution) as MachineInput["resolution"],
      ...(laptop ? { laptop: true, ...(tgpW ? { gpuTgpW: tgpW } : {}) } : {}),
    });
    void create(laptop ? { ...spec, laptopModel: model.trim() || null } : spec);
  };

  return (
    <>
      <div className="title-row">
        <div>
          <h1>{first ? shown : T.title(shown)}</h1>
          <p className="sub">{first ? T.subFirst : T.subMore}</p>
        </div>
        {onCancel && <button type="button" className="btn small" onClick={onCancel}>{t.common.cancel}</button>}
      </div>

      <div className="new-machine">
        <section className="panel nm-scan" aria-labelledby="h-nm-scan">
          <div className="nm-hello">
            <Mascot size={92} />
            <h2 id="h-nm-scan">{T.scanTitle}</h2>
          </div>
          <p className="muted">{T.scanText}</p>
          <ol className="nm-steps">
            {T.steps.map((s) => <li key={s}>{s}</li>)}
          </ol>
          <div className="nm-actions">
            <a href="/tai/pcdex-scan.exe" download className="btn primary">{t.machine.downloadScan}</a>
            <Link href={p("/quet")} className="btn">{t.machine.haveCode}</Link>
          </div>
          {browserSpec && (
            <div className="nm-browser">
              <p>{T.browserSpec(browserSpec.cpu, browserSpec.gpu, partLabel.ram(browserSpec.ram[0]!))}</p>
              <button type="button" className="btn small" disabled={busy} onClick={() => void create(browserSpec)}>{T.useThis}</button>
            </div>
          )}
        </section>

        <section className="panel" aria-labelledby="h-nm-manual">
          <h2 id="h-nm-manual">{T.manual}</h2>
          <form className="form nm-form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
            <div className="segmented" role="group" aria-label={t.cfg.machineType}>
              <button type="button" aria-pressed={!laptop} onClick={() => switchType(false)}>{t.cfg.desktop}</button>
              <button type="button" aria-pressed={laptop} onClick={() => switchType(true)}>{t.cfg.laptop}</button>
            </div>
            {laptop && (
              <div className="field">
                <label htmlFor="nm-model">{t.cfg.laptopModel}</label>
                <input id="nm-model" className="input" value={model} maxLength={80} placeholder={t.cfg.laptopModelPh} onChange={(e) => setModel(e.target.value)} />
              </div>
            )}
            <div className="field">
              <label htmlFor="nm-cpu">CPU</label>
              <Combo id="nm-cpu" value={d.cpu} onChange={set("cpu")} options={CPU_OPTIONS} placeholder={T.cpuPh} />
            </div>
            <div className="field">
              <label htmlFor="nm-gpu">{t.cfg.gpu}</label>
              <Combo id="nm-gpu" value={d.gpu} onChange={set("gpu")} options={GPU_OPTIONS} placeholder={T.gpuPh} />
              <span className="hint">{T.igpuHint}</span>
            </div>
            {laptop && tgp && (
              <Pick id="nm-tgp" label={t.cfg.tgp} value={String(tgpW ?? tgp.default)} onChange={(v) => setTgpW(Number(v))}
                options={[...new Set([tgp.default, ...Array.from({ length: Math.floor((tgp.max - tgp.min) / 5) + 1 }, (_, i) => tgp.max - i * 5), tgp.min])]
                  .sort((a, b) => b - a).map((w) => [String(w), w === tgp.default ? t.cfg.tgpDefault(w) : `${w} W`] as const)} />
            )}
            <div className="nm-pair">
              <Pick id="nm-ram" label={T.ramTotal} value={d.ramGb} onChange={set("ramGb")} options={RAM_TOTAL.map((n) => [String(n), `${n} GB`])} />
              <Pick id="nm-ch" label={T.ramSticks} value={d.ramChannels} onChange={set("ramChannels")} options={[["1", T.oneStick], ["2", T.twoPlus]]} />
            </div>
            {laptop ? (
              <div className="nm-pair">
                <Pick id="nm-drive" label={T.bootDrive} value={d.storage} onChange={set("storage")} options={Object.entries(t.cfg.storage)} />
                <Pick id="nm-res" label={T.screen} value={d.resolution} onChange={set("resolution")} options={Object.entries(t.cfg.res)} />
              </div>
            ) : (
              <>
                <div className="nm-pair">
                  <Pick id="nm-drive" label={T.bootDrive} value={d.storage} onChange={set("storage")} options={Object.entries(t.cfg.storage)} />
                  <Pick id="nm-pcie" label={T.gpuSlot} value={d.pcieGen} onChange={set("pcieGen")} options={[3, 4, 5].map((g) => [String(g), `PCIe ${g}.0`])} />
                </div>
                <div className="nm-pair">
                  <Pick id="nm-psu" label={T.psu} value={d.psuW} onChange={set("psuW")} options={PSU.map((w) => [String(w), `${w} W`])} />
                  <Pick id="nm-res" label={T.screen} value={d.resolution} onChange={set("resolution")} options={Object.entries(t.cfg.res)} />
                </div>
              </>
            )}
            <p className="hint muted">{T.later}</p>
            <button className="btn primary nm-go" disabled={left > 0 || busy}>
              {busy ? t.common.saving : left ? T.left(left) : T.submit}
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
  const { t } = useI18n();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} className={`input${value ? "" : " unset"}`} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="" disabled>{t.newMachine.choose}</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}

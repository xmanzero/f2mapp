import {
  benchForSpec, evaluate, isLaptop, localizePartLabel, measuredRender, partLabel, resolveMachine, RESOLUTION_LABEL, specToInput, TIERS, tierName,
  type BenchResult, type MachineSpec, type PartKind,
} from "@f2m/shared";
import { View } from "react-native";
import { useI18n } from "@/lib/i18n";
import { FONT, useTheme } from "@/lib/theme";
import { Card, Divider, Pill, Row, T } from "./ui";

export interface MachineData {
  id: string; name: string; isPrimary: boolean; spec: MachineSpec; lastScanAt: string | null;
  bench?: (BenchResult & { at?: string }) | null;
  parts: { kind: PartKind; label: string; verified: boolean; status?: string }[];
}

/** Điểm, hạng, Gaming / Đồ họa / AI, FPS ba độ phân giải, số đo hiệu năng, cấu hình — dùng chung công thức với web (packages/shared) */
export function MachineView({ m }: { m: MachineData }) {
  const { t, locale, n0 } = useI18n();
  const c = useTheme();
  const T_ = t.machine;
  const spec = m.spec;
  const cfg = resolveMachine(specToInput(spec), measuredRender(benchForSpec(m.bench ?? null, spec)));
  const r = evaluate(cfg, new Date().getFullYear(), locale);
  const s = r.scores;
  const tier = r.tier;
  const ink = c.tier[tier.code] ?? c.text;
  const laptop = isLaptop(spec);
  const inUse = m.parts.filter((p) => p.status === undefined || p.status === "in_use");
  const ok = (kind: PartKind, i = 0) => inUse.filter((p) => p.kind === kind)[i]?.verified ?? false;
  const maxFps = Math.max(...r.bottlenecks.map((b) => Math.max(b.gpuFps, b.cpuFps))) * 1.08;
  const bench = benchForSpec(m.bench ?? null, spec);
  const benchRows = bench ? ([["CPU", bench.cpu], [T_.kinds.gpu!, bench.gpu]] as const).filter(([, d]) => d?.trust === "verified" && d.pct != null) : [];

  const rows: { key: string; label: string; value: string; verified: boolean }[] = [
    ...(laptop ? [{ key: "model", label: T_.kinds.model!, value: spec.laptopModel ?? T_.laptop, verified: false }] : []),
    { key: "cpu", label: "CPU", value: spec.cpu, verified: ok("cpu") },
    { key: "gpu", label: T_.kinds.gpu!, value: spec.gpu + (laptop && spec.gpuTgpW ? ` · ${spec.gpuTgpW} W` : ""), verified: ok("gpu") },
    ...(laptop ? [] : [{ key: "mb", label: T_.kinds.mainboard!, value: localizePartLabel(partLabel.mainboard(spec.mainboard), locale), verified: ok("mainboard") }]),
    ...spec.ram.map((k, i) => ({ key: `ram${i}`, label: "RAM", value: partLabel.ram(k), verified: ok("ram", i) })),
    ...spec.drives.map((d, i) => ({ key: `d${i}`, label: T_.kinds.storage!, value: partLabel.drive(d), verified: ok("storage", i) })),
    ...(laptop ? [] : [{ key: "psu", label: T_.kinds.psu!, value: localizePartLabel(partLabel.psu(spec.psu), locale), verified: false }]),
  ];

  return (
    <View style={{ gap: 14 }}>
      <Card tone={c.tierFill[tier.code]} style={{ borderWidth: 2, borderColor: ink }}>
        <Row style={{ justifyContent: "space-between" }}>
          <T v="label">{T_.power}</T>
          {laptop && <Pill tone="accent">{T_.laptop}</Pill>}
        </Row>
        <T v="display" style={{ color: ink }} accessibilityLabel={`${T_.power} ${n0(s.power)}`}>{n0(s.power)}</T>
        <T style={{ fontFamily: FONT.semibold, color: ink }}>{T_.tier(tierName(tier, locale))}</T>
        <T v="muted">{T_.times((s.power / 10000).toLocaleString(locale === "en" ? "en-US" : "vi-VN", { maximumFractionDigits: 2 }))}</T>
        <Row style={{ marginTop: 4 }}>
          {([["gaming", T_.gaming], ["render", T_.render], ["ai", T_.ai]] as const).map(([k, label]) => (
            <View key={k} style={{ flex: 1, backgroundColor: c.surface, borderRadius: 12, padding: 10 }}>
              <T v="faint">{label}</T>
              <T style={{ fontFamily: FONT.display, fontSize: 20 }}>{n0(s[k])}</T>
            </View>
          ))}
        </Row>
        <NextTier power={s.power} />
      </Card>

      <Card>
        <T v="h2">{T_.fps}</T>
        {r.bottlenecks.map((b) => {
          const mine = b.resolution === spec.resolution;
          return (
            <View key={b.resolution} style={{ gap: 6 }}>
              <Row style={{ justifyContent: "space-between" }}>
                <T v="small" style={{ fontFamily: FONT.medium }}>{RESOLUTION_LABEL[b.resolution]}{mine ? ` · ${T_.yourScreen}` : ""}</T>
                <T style={{ fontFamily: FONT.display, fontSize: 18, color: mine ? c.accent : c.text }}>{Math.round(b.fps)} FPS</T>
              </Row>
              <View style={{ height: 8, borderRadius: 4, backgroundColor: c.track, overflow: "hidden" }}>
                <View style={{ width: `${Math.min(100, (b.fps / maxFps) * 100)}%`, height: 8, borderRadius: 4, backgroundColor: mine ? c.accent : c.control }} />
              </View>
            </View>
          );
        })}
        <T v="muted">{r.findings[0]?.message}</T>
      </Card>

      {benchRows.length > 0 && (
        <Card>
          <T v="h2">{T_.bench}</T>
          {benchRows.map(([label, d]) => (
            <Row key={label} style={{ justifyContent: "space-between" }}>
              <T v="small">{label} · {d!.part}</T>
              <T style={{ fontFamily: FONT.display, fontSize: 18, color: d!.pct! >= 95 ? c.positive : d!.pct! >= 85 ? c.accent : c.warning }}>{d!.pct}%</T>
            </Row>
          ))}
        </Card>
      )}

      <Card>
        <T v="h2">{T_.config}</T>
        {rows.map((row, i) => (
          <View key={row.key} style={{ gap: 10 }}>
            {i > 0 && <Divider />}
            <View style={{ gap: 4 }}>
              <T v="faint">{row.label}</T>
              <Row style={{ flexWrap: "wrap" }}>
                <T style={{ fontFamily: FONT.medium, flexShrink: 1 }}>{row.value}</T>
                {row.verified && <Pill tone="positive">{T_.verified}</Pill>}
              </Row>
            </View>
          </View>
        ))}
      </Card>
    </View>
  );
}

function NextTier({ power }: { power: number }) {
  const { locale, n0 } = useI18n();
  const c = useTheme();
  const i = TIERS.findIndex((x) => x.min > power);
  if (i < 1) return null;
  const from = TIERS[i - 1]!, to = TIERS[i]!;
  const pct = ((power - from.min) / (to.min - from.min)) * 100;
  return (
    <View style={{ gap: 6 }}>
      <T v="small">{locale === "en" ? `${n0(to.min - power)} points to ${tierName(to, locale)}` : `Còn ${n0(to.min - power)} điểm lên ${tierName(to, locale)}`}</T>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: c.track }}>
        <View style={{ width: `${pct}%`, height: 6, borderRadius: 3, backgroundColor: c.tier[from.code] }} />
      </View>
    </View>
  );
}

import { TIERS, tierName } from "@f2m/shared";
import { Stack, router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { Avatar, Card, Empty, Loading, Pill, Row, Screen, Segmented, T } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { FONT, useTheme } from "@/lib/theme";

interface BoardRow {
  userId: string; handle: string; displayName: string; province: string | null; cpu: string | null; gpu: string | null;
  power: number; tier: string; verified?: boolean; likes?: number;
  bench?: { cpu: number | null; gpu: number | null } | null; laptop?: { model: string | null } | null;
}

/** Bảng xếp hạng máy thật, chia Máy bàn / Laptop (máy mẫu chỉ có trên web khi còn ít người) */
export default function Board() {
  const { t, locale, n0 } = useI18n();
  const { user } = useSession();
  const c = useTheme();
  const [rows, setRows] = useState<BoardRow[] | null>(null);
  const [kind, setKind] = useState<"desktop" | "laptop">("desktop");
  const [refreshing, setRefreshing] = useState(false);
  const fetchRows = () => api<{ items: BoardRow[] }>("/v1/leaderboard").then((r) => r.items).catch(() => [] as BoardRow[]);
  const load = async () => setRows(await fetchRows());
  useEffect(() => { let live = true; void fetchRows().then((x) => { if (live) setRows(x); }); return () => { live = false; }; }, []);

  const shown = (rows ?? []).filter((r) => !!r.laptop === (kind === "laptop"));
  const laptops = (rows ?? []).filter((r) => r.laptop).length;
  return (
    <Screen refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}>
      <Stack.Screen options={{ title: t.board.title, headerLargeTitle: true }} />
      <Segmented value={kind} onChange={setKind}
        options={[["desktop", `${t.board.desktop} ${(rows?.length ?? 0) - laptops}`], ["laptop", `${t.board.laptop} ${laptops}`]]} />
      {rows === null ? <Loading /> : shown.length === 0 ? <Empty text={t.board.empty} /> : (
        <Card style={{ padding: 6, gap: 0 }}>
          {shown.map((r, i) => {
            const tier = TIERS.find((x) => x.code === r.tier);
            const me = user?.id === r.userId;
            const bench = r.bench ? [r.bench.cpu != null ? `CPU ${r.bench.cpu}%` : null, r.bench.gpu != null ? `GPU ${r.bench.gpu}%` : null].filter(Boolean).join(" · ") : "";
            return (
              <Pressable key={r.userId} onPress={() => router.push({ pathname: "/u/[handle]", params: { handle: r.handle } })}
                accessibilityRole="button" accessibilityLabel={`${i + 1}. ${r.displayName}, ${n0(r.power)} ${t.common.points}`}
                style={({ pressed }) => ({ padding: 12, borderRadius: 14, backgroundColor: me ? c.accentSoft : pressed ? c.raised : "transparent" })}>
                <Row style={{ alignItems: "flex-start" }}>
                  <T style={{ width: 26, fontFamily: FONT.semibold, color: c.faint, marginTop: 8 }}>{i + 1}</T>
                  <Avatar name={r.displayName} accent={me} />
                  <View style={{ flex: 1, gap: 3 }}>
                    <T style={{ fontFamily: FONT.semibold }} numberOfLines={1}>{r.displayName}</T>
                    <T v="faint" numberOfLines={1}>@{r.handle}{r.province ? ` · ${r.province}` : ""}{r.likes ? ` · ♥ ${r.likes}` : ""}</T>
                    <T v="small" numberOfLines={2} style={{ color: c.muted }}>{r.cpu} + {r.gpu}{r.laptop?.model ? `\n${r.laptop.model}` : ""}</T>
                    {bench ? <Pill tone="positive">{t.board.benched} · {bench}</Pill> : null}
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    <T style={{ fontFamily: FONT.display, fontSize: 18 }}>{n0(r.power)}</T>
                    {tier && <T v="faint" style={{ color: c.tier[tier.code] }}>{tierName(tier, locale)}</T>}
                  </View>
                </Row>
              </Pressable>
            );
          })}
        </Card>
      )}
    </Screen>
  );
}

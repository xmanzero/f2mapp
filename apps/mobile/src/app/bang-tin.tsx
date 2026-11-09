import { TIERS, tierName } from "@f2m/shared";
import { Stack, router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { Avatar, Card, Empty, Loading, Row, Screen, T } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { FONT } from "@/lib/theme";

interface Item {
  id: string; kind: string; createdAt: string; mine: boolean; user: { handle: string; displayName: string };
  data: { cpu?: unknown; gpu?: unknown; laptop?: boolean; kind?: string; from?: string; to?: string; power?: number; listingId?: string; name?: string; priceVnd?: number };
}

/** Bảng tin: hoạt động của người mình theo dõi (thêm máy, đổi linh kiện, lên hạng, đăng tin bán, đo hiệu năng) */
export default function Feed() {
  const { t, locale, n0, vnd, ago } = useI18n();
  const [items, setItems] = useState<Item[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const fetchFeed = () => api<{ items: Item[] }>("/v1/feed").then((r) => r.items).catch(() => [] as Item[]);
  const load = async () => setItems(await fetchFeed());
  useEffect(() => { let live = true; void fetchFeed().then((x) => { if (live) setItems(x); }); return () => { live = false; }; }, []);

  const en = locale === "en";
  const text = (it: Item): string | null => {
    const d = it.data;
    const part = (x: unknown, label: string) => (x && typeof x === "object" && "pct" in x ? `${label} ${(x as { pct: number }).pct}%` : null);
    switch (it.kind) {
      case "machine_added": return en ? `added a ${d.laptop ? "laptop" : "PC"}: ${String(d.cpu)} + ${String(d.gpu)}` : `đã thêm ${d.laptop ? "laptop" : "máy"} ${String(d.cpu)} + ${String(d.gpu)}`;
      case "part_changed": return en ? `swapped the ${d.kind === "cpu" ? "CPU" : "graphics card"}: ${d.from} → ${d.to}` : `đã đổi ${d.kind === "cpu" ? "CPU" : "card đồ họa"}: ${d.from} → ${d.to}`;
      case "tier_up": { const tr = TIERS.find((x) => x.code === d.to); return en ? `reached ${tr ? tierName(tr, locale) : d.to} · ${n0(d.power ?? 0)} points` : `lên hạng ${tr ? tierName(tr, locale) : d.to} · ${n0(d.power ?? 0)} điểm`; }
      case "listing_posted": return en ? `is selling ${d.name} · ${vnd(d.priceVnd ?? 0)}` : `đăng bán ${d.name} · ${vnd(d.priceVnd ?? 0)}`;
      case "bench_verified": { const p = [part(d.cpu, "CPU"), part(d.gpu, "GPU")].filter(Boolean).join(" · "); return en ? `benchmarked: ${p}` : `đo hiệu năng thật: ${p}`; }
      default: return null;
    }
  };

  return (
    <Screen refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}>
      <Stack.Screen options={{ title: t.feed.title }} />
      {items === null ? <Loading /> : items.length === 0 ? <Empty text={t.feed.empty} /> : (
        <Card style={{ gap: 0, padding: 6 }}>
          {items.map((it) => {
            const s = text(it);
            if (!s) return null;
            return (
              <Pressable key={it.id} style={{ padding: 12 }}
                onPress={() => it.kind === "listing_posted" && it.data.listingId ? router.push({ pathname: "/cho/[id]", params: { id: it.data.listingId } }) : router.push({ pathname: "/u/[handle]", params: { handle: it.user.handle } })}>
                <Row style={{ alignItems: "flex-start" }}>
                  <Avatar name={it.user.displayName} accent={it.mine} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <T><T style={{ fontFamily: FONT.semibold }}>{it.mine ? (en ? "You" : "Bạn") : it.user.displayName}</T> {s}</T>
                    <T v="faint">{ago(it.createdAt)}</T>
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

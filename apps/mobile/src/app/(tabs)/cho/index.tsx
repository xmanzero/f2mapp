import { localizePartLabel } from "@f2m/shared";
import { Image } from "expo-image";
import { Stack, router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { Card, Empty, Loading, Pill, Row, Screen, T } from "@/components/ui";
import { api, photoUrl } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { Listing } from "@/lib/types";
import { FONT, RADIUS, useTheme } from "@/lib/theme";

/** Chợ: tin đang bán (mới nhất trước), tìm theo tên */
export default function Market() {
  const { t, locale, vnd, ago } = useI18n();
  const c = useTheme();
  const [items, setItems] = useState<Listing[] | null>(null);
  const [q, setQ] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const fetchList = (query: string) => api<{ items: Listing[] }>(`/v1/listings?limit=100${query ? `&q=${encodeURIComponent(query)}` : ""}`)
    .then((r) => r.items).catch(() => [] as Listing[]);
  const load = async (query = "") => setItems(await fetchList(query));
  useEffect(() => { let live = true; void fetchList("").then((x) => { if (live) setItems(x); }); return () => { live = false; }; }, []);

  return (
    <Screen refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(q); setRefreshing(false); }}>
      <Stack.Screen options={{ title: t.market.title, headerLargeTitle: true }} />
      <TextInput value={q} onChangeText={setQ} onSubmitEditing={() => void load(q.trim())} placeholder={t.market.search} placeholderTextColor={c.faint}
        returnKeyType="search" accessibilityLabel={t.market.search}
        style={{ height: 46, borderRadius: RADIUS.pill, paddingHorizontal: 18, backgroundColor: c.surface, color: c.text, fontFamily: FONT.regular, fontSize: 15 }} />
      {items === null ? <Loading /> : items.length === 0 ? <Empty text={t.market.empty} /> : items.map((l) => (
        <Pressable key={l.id} onPress={() => router.push({ pathname: "/cho/[id]", params: { id: l.id } })} accessibilityRole="button">
          {({ pressed }) => (
            <Card style={{ flexDirection: "row", gap: 12, padding: 12, opacity: pressed ? 0.85 : 1 }}>
              <View style={{ width: 76, height: 76, borderRadius: 12, overflow: "hidden", backgroundColor: c.raised, alignItems: "center", justifyContent: "center" }}>
                {l.photos[0] ? <Image source={photoUrl(l.photos[0])} style={{ width: 76, height: 76 }} contentFit="cover" />
                  : <T v="faint" style={{ fontFamily: FONT.semibold }}>{l.kind.toUpperCase()}</T>}
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <T style={{ fontFamily: FONT.semibold }} numberOfLines={2}>{localizePartLabel(l.name, locale)}</T>
                <T style={{ fontFamily: FONT.display, fontSize: 17, color: c.accent }}>{vnd(l.priceVnd)}</T>
                <Row style={{ flexWrap: "wrap", gap: 6 }}>
                  <Pill>{t.market.condition[l.condition] ?? l.condition}</Pill>
                  {l.source?.verified && <Pill tone="positive">{t.machine.verified}</Pill>}
                </Row>
                <T v="faint">{[l.province, ago(l.createdAt)].filter(Boolean).join(" · ")}</T>
              </View>
            </Card>
          )}
        </Pressable>
      ))}
    </Screen>
  );
}

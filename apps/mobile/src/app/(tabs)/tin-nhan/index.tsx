import { localizePartLabel } from "@f2m/shared";
import { Stack, router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";
import { Avatar, Button, Card, Empty, Loading, Row, Screen, T } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import type { Conv } from "@/lib/types";
import { FONT, useTheme } from "@/lib/theme";

/** Hộp thư: hội thoại mới nhất trước, số tin chưa đọc */
export default function Inbox() {
  const { t, locale, ago } = useI18n();
  const { user } = useSession();
  const c = useTheme();
  const [items, setItems] = useState<Conv[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    const r = await api<{ items: Conv[] }>("/v1/conversations").catch(() => ({ items: [] as Conv[] }));
    setItems(r.items);
  }, []);
  // tải lại mỗi khi quay về tab (đọc xong một hội thoại thì số chưa đọc đổi)
  useFocusEffect(useCallback(() => { if (user) void load(); }, [user, load]));

  const header = <Stack.Screen options={{ title: t.msg.title, headerLargeTitle: true }} />;
  if (user === null) return <Screen>{header}<Empty text={t.auth.needLogin}><Button kind="primary" title={t.common.login} onPress={() => router.push("/dang-nhap")} /></Empty></Screen>;
  return (
    <Screen refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}>
      {header}
      {items === null ? <Loading /> : items.length === 0 ? <Empty text={t.msg.empty} /> : (
        <Card style={{ padding: 6, gap: 0 }}>
          {items.map((cv) => (
            <Pressable key={cv.id} onPress={() => router.push({ pathname: "/tin-nhan/[id]", params: { id: cv.id } })} accessibilityRole="button"
              style={({ pressed }) => ({ padding: 12, borderRadius: 14, backgroundColor: pressed ? c.raised : "transparent" })}>
              <Row style={{ alignItems: "flex-start" }}>
                <Avatar name={cv.other.displayName} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Row style={{ justifyContent: "space-between" }}>
                    <T style={{ fontFamily: FONT.semibold, flexShrink: 1 }} numberOfLines={1}>{cv.other.displayName}</T>
                    <T v="faint">{ago(cv.lastMessageAt)}</T>
                  </Row>
                  {cv.listing && <T v="faint" style={{ color: c.accent }} numberOfLines={1}>{localizePartLabel(cv.listing.name, locale)}</T>}
                  <T v="muted" numberOfLines={1} style={cv.unread ? { color: c.text, fontFamily: FONT.semibold } : undefined}>
                    {cv.last?.mine ? t.msg.you : ""}{cv.last?.image && !cv.last.body ? t.msg.photo : cv.last?.body}
                  </T>
                </View>
                {cv.unread > 0 && (
                  <View style={{ minWidth: 22, height: 22, borderRadius: 11, backgroundColor: c.accent, alignItems: "center", justifyContent: "center", alignSelf: "center", paddingHorizontal: 6 }}>
                    <T style={{ color: c.accentInk, fontFamily: FONT.bold, fontSize: 12 }}>{cv.unread}</T>
                  </View>
                )}
              </Row>
            </Pressable>
          ))}
        </Card>
      )}
    </Screen>
  );
}

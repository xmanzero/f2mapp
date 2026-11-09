import { localizePartLabel } from "@f2m/shared";
import { Image } from "expo-image";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Dimensions, ScrollView, View } from "react-native";
import { Avatar, Button, Card, Divider, Empty, Loading, Pill, Row, Screen, T } from "@/components/ui";
import { api, ApiError, photoUrl } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import type { Listing } from "@/lib/types";
import { FONT, useTheme } from "@/lib/theme";

/** Chi tiết tin: ảnh, giá, tình trạng, người bán, nhắn tin cho người bán */
export default function ListingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, locale, vnd } = useI18n();
  const { user } = useSession();
  const c = useTheme();
  const [l, setL] = useState<Listing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<{ item: Listing }>(`/v1/listings/${id}`).then((r) => setL(r.item)).catch((e: ApiError) => setError(e.message)); }, [id, user]);

  if (error && !l) return <Screen><Empty text={error} /></Screen>;
  if (!l) return <Loading />;
  const w = Dimensions.get("window").width - 32;
  const message = async () => {
    if (!user) { router.push("/dang-nhap"); return; }
    setBusy(true);
    try {
      const r = await api<{ id: string }>("/v1/conversations", { body: { listingId: l.id } });
      router.push({ pathname: "/tin-nhan/[id]", params: { id: r.id } });
    } catch (e) { setError((e as ApiError).message); }
    setBusy(false);
  };
  return (
    <Screen>
      <Stack.Screen options={{ title: "" }} />
      {l.photos.length ? (
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={{ borderRadius: 20 }}>
          {l.photos.map((p) => <Image key={p} source={photoUrl(p)} style={{ width: w, height: w * 0.75, borderRadius: 20 }} contentFit="cover" />)}
        </ScrollView>
      ) : <Card><T v="muted">{t.market.photosNone}</T></Card>}
      <View style={{ gap: 6 }}>
        <T v="title">{localizePartLabel(l.name, locale)}</T>
        <T style={{ fontFamily: FONT.display, fontSize: 30, color: c.accent }}>{vnd(l.priceVnd)}</T>
        <Row style={{ flexWrap: "wrap", gap: 6 }}>
          <Pill>{t.market.condition[l.condition] ?? l.condition}</Pill>
          <Pill>{t.market.warranty(l.warrantyMonths)}</Pill>
          {l.province ? <Pill>{l.province}</Pill> : null}
          {l.source?.verified ? <Pill tone="positive">{t.machine.verified}</Pill> : null}
        </Row>
      </View>
      {l.description ? <Card><T>{l.description}</T></Card> : null}
      <Card>
        <T v="label">{t.market.seller}</T>
        <Row>
          <Avatar name={l.seller.displayName} />
          <View style={{ flex: 1 }}>
            <T style={{ fontFamily: FONT.semibold }} onPress={() => router.push({ pathname: "/u/[handle]", params: { handle: l.seller.handle } })}>{l.seller.displayName}</T>
            <T v="faint">@{l.seller.handle}</T>
          </View>
        </Row>
        {l.source?.machine ? <><Divider /><T v="muted">{l.source.machine}</T></> : null}
        {l.mine ? <Pill tone="accent">{t.market.mine}</Pill> : (
          <>
            <Button kind="primary" title={user ? t.market.message : t.market.loginToContact} busy={busy} onPress={message} />
            {l.contact ? <T v="muted">{t.market.contact}: <T style={{ fontFamily: FONT.semibold }}>{l.contact}</T></T> : null}
          </>
        )}
        {error ? <T style={{ color: c.negative }}>{error}</T> : null}
      </Card>
    </Screen>
  );
}

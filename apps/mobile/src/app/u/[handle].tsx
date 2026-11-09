import { localizePartLabel } from "@f2m/shared";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { MachineView, type MachineData } from "@/components/machine";
import { safetyMenu } from "@/components/safety";
import { Avatar, Button, Card, Empty, Loading, Row, Screen, T } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import type { Listing } from "@/lib/types";
import { FONT, useTheme } from "@/lib/theme";

interface Profile {
  user: { id: string; handle: string; displayName: string; province: string | null; joinedAt: string };
  me: boolean; following: boolean; blocked?: boolean; followers: number; followingCount: number;
  machines: (MachineData & { likes: number; liked: boolean })[]; listings: Listing[];
}

/** Hồ sơ công khai: theo dõi, nhắn tin, chặn / báo cáo, các máy (thích), tin đang bán */
export default function ProfileScreen() {
  const { handle } = useLocalSearchParams<{ handle: string }>();
  const { t, locale, n0, vnd } = useI18n();
  const { user } = useSession();
  const c = useTheme();
  const [p, setP] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<Profile>(`/v1/users/${encodeURIComponent(handle)}`).then(setP).catch((e: ApiError) => setError(e.message)); }, [handle, user]);
  if (error) return <Screen><Empty text={error} /></Screen>;
  if (!p) return <Loading />;
  const T_ = t.profile;

  const need = () => { if (!user) { router.push("/dang-nhap"); return true; } return false; };
  const follow = async () => {
    if (need()) return;
    setBusy(true);
    try {
      const r = await api<{ following: boolean; followers: number }>(`/v1/users/${encodeURIComponent(p.user.handle)}/follow`, { method: p.following ? "DELETE" : "POST", body: {} });
      setP({ ...p, ...r });
    } catch (e) { setError((e as ApiError).message); }
    setBusy(false);
  };
  const message = async () => {
    if (need()) return;
    try {
      const r = await api<{ id: string }>("/v1/conversations", { body: { handle: p.user.handle } });
      router.push({ pathname: "/tin-nhan/[id]", params: { id: r.id } });
    } catch (e) { setError((e as ApiError).message); }
  };
  const like = async (m: Profile["machines"][number]) => {
    if (need()) return;
    const r = await api<{ liked: boolean; likes: number }>(`/v1/machines/${m.id}/like`, { method: m.liked ? "DELETE" : "POST", body: {} }).catch(() => null);
    if (r) setP({ ...p, machines: p.machines.map((x) => (x.id === m.id ? { ...x, ...r } : x)) });
  };
  const menu = async () => {
    if (need()) return;
    const b = await safetyMenu(t, { handle: p.user.handle, name: p.user.displayName, blocked: !!p.blocked });
    if (b !== null) setP({ ...p, blocked: b, following: b ? false : p.following });
  };

  return (
    <Screen>
      <Stack.Screen options={{
        title: p.user.displayName,
        headerRight: p.me ? undefined : () => <Pressable onPress={menu} hitSlop={12} accessibilityLabel={t.safety.report}><T style={{ fontSize: 22 }}>⋯</T></Pressable>,
      }} />
      <Card>
        <Row>
          <Avatar name={p.user.displayName} size={56} />
          <View style={{ flex: 1, gap: 2 }}>
            <T style={{ fontFamily: FONT.semibold, fontSize: 18 }}>{p.user.displayName}</T>
            <T v="faint">@{p.user.handle}{p.user.province ? ` · ${p.user.province}` : ""}</T>
            <T v="small" style={{ color: c.muted }}>{T_.followers(n0(p.followers))} · {T_.followingN(n0(p.followingCount))}</T>
          </View>
        </Row>
        {!p.me && (p.blocked ? <T v="muted">{t.msg.blocked}</T> : (
          <Row>
            <Button kind={p.following ? "secondary" : "primary"} title={p.following ? T_.following : T_.follow} busy={busy} onPress={follow} style={{ flex: 1 }} />
            <Button title={T_.message} onPress={message} style={{ flex: 1 }} />
          </Row>
        ))}
      </Card>
      {p.machines.length === 0 ? <Empty text={T_.noMachine} /> : p.machines.map((m) => (
        <View key={m.id} style={{ gap: 10 }}>
          <Row style={{ justifyContent: "space-between" }}>
            <T v="h2">{m.name}</T>
            {!p.me && <Button small title={`${m.liked ? T_.liked : T_.like} · ${m.likes}`} onPress={() => void like(m)} />}
          </Row>
          <MachineView m={m} />
        </View>
      ))}
      {p.listings.length > 0 && (
        <Card>
          <T v="h2">{T_.listings}</T>
          {p.listings.map((l) => (
            <Pressable key={l.id} onPress={() => router.push({ pathname: "/cho/[id]", params: { id: l.id } })}>
              <Row style={{ justifyContent: "space-between", paddingVertical: 6 }}>
                <T style={{ flex: 1 }} numberOfLines={1}>{localizePartLabel(l.name, locale)}</T>
                <T style={{ fontFamily: FONT.semibold }}>{vnd(l.priceVnd)}</T>
              </Row>
            </Pressable>
          ))}
        </Card>
      )}
    </Screen>
  );
}

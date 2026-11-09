import { localizePartLabel } from "@f2m/shared";
import { Image } from "expo-image";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View, type ScrollViewInstance } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { safetyMenu } from "@/components/safety";
import { Loading, Row, T } from "@/components/ui";
import { api, ApiError, messageImage, photoUrl } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { Conv, Msg } from "@/lib/types";
import { FONT, RADIUS, useTheme } from "@/lib/theme";

/** Một hội thoại: tin cũ → mới, tự hỏi tin mới mỗi 5 giây, gửi chữ / ảnh, chặn / báo cáo */
export default function Thread() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, locale, vnd, ago } = useI18n();
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const [conv, setConv] = useState<Conv | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const last = useRef<string | null>(null);
  const scroll = useRef<ScrollViewInstance>(null);

  useEffect(() => {
    let live = true;
    api<{ conversation: Conv; messages: Msg[] }>(`/v1/conversations/${id}`).then((r) => {
      if (!live) return;
      setConv(r.conversation); setMsgs(r.messages);
      last.current = r.messages.at(-1)?.createdAt ?? null;
    }).catch((e: ApiError) => live && setError(e.message));
    const timer = setInterval(() => {
      const after = last.current ? `?after=${encodeURIComponent(last.current)}` : "";
      api<{ messages: Msg[] }>(`/v1/conversations/${id}${after}`).then((r) => {
        if (!live || !r.messages.length) return;
        setMsgs((m) => [...m, ...r.messages.filter((x) => !m.some((y) => y.id === x.id))]);
        last.current = r.messages.at(-1)!.createdAt;
      }).catch(() => {});
    }, 5000);
    return () => { live = false; clearInterval(timer); };
  }, [id]);

  const push = (m: Msg) => { setMsgs((x) => [...x, m]); last.current = m.createdAt; };
  const send = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true); setError(null);
    try { push((await api<{ message: Msg }>(`/v1/conversations/${id}/messages`, { body: { body } })).message); setText(""); }
    catch (e) { setError((e as ApiError).message); }
    setBusy(false);
  };
  /** Chọn ảnh → thu về rộng ≤ 1600 px, JPEG 80% (máy chủ đổi tiếp sang WebP, bỏ metadata) */
  const sendPhoto = async () => {
    const pickRes = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1 });
    if (pickRes.canceled || !pickRes.assets[0]) return;
    setBusy(true); setError(null);
    try {
      const a = pickRes.assets[0];
      const ctx = ImageManipulator.manipulate(a.uri, a.width > 1600 ? { maxWidth: 1600 } : undefined);
      const out = await (await ctx.renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
      const blob = await (await fetch(out.uri)).blob();
      push((await api<{ message: Msg }>(`/v1/conversations/${id}/images`, { raw: blob, contentType: "image/jpeg" })).message);
    } catch (e) { setError((e as Error).message); }
    setBusy(false);
  };

  if (error && !conv) return <View style={{ padding: 16 }}><T style={{ color: c.negative }}>{error}</T></View>;
  if (!conv) return <Loading />;
  const l = conv.listing;
  const menu = async () => {
    const b = await safetyMenu(t, { handle: conv.other.handle, name: conv.other.displayName, blocked: !!conv.blocked, conversationId: id });
    if (b !== null) setConv({ ...conv, blocked: b, canSend: !b && !conv.other.banned });
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.ground }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      <Stack.Screen options={{
        title: conv.other.displayName,
        headerRight: () => <Pressable onPress={menu} hitSlop={12} accessibilityLabel={t.safety.report}><T style={{ fontSize: 22, color: c.text }}>⋯</T></Pressable>,
      }} />
      {l && (
        <Pressable onPress={() => router.push({ pathname: "/cho/[id]", params: { id: l.id } })}
          style={{ flexDirection: "row", gap: 10, alignItems: "center", margin: 12, padding: 10, borderRadius: RADIUS.inner, backgroundColor: c.raised }}>
          {l.photo && <Image source={photoUrl(l.photo)} style={{ width: 44, height: 44, borderRadius: 8 }} />}
          <View style={{ flex: 1 }}>
            <T v="faint">{t.msg.about}</T>
            <T style={{ fontFamily: FONT.semibold }} numberOfLines={1}>{localizePartLabel(l.name, locale)}</T>
          </View>
          {l.priceVnd ? <T style={{ fontFamily: FONT.semibold }}>{vnd(l.priceVnd)}</T> : null}
        </Pressable>
      )}
      <ScrollView ref={scroll} contentContainerStyle={{ padding: 12, gap: 8 }} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}>
        {msgs.length === 0 && <T v="muted" style={{ textAlign: "center", marginTop: 24 }}>{t.msg.first(conv.other.displayName)}</T>}
        {msgs.map((m) => (
          <View key={m.id} style={{ alignSelf: m.mine ? "flex-end" : "flex-start", maxWidth: "80%", backgroundColor: m.mine ? c.accentSoft : c.surface,
            borderRadius: 16, borderBottomRightRadius: m.mine ? 4 : 16, borderBottomLeftRadius: m.mine ? 16 : 4, padding: m.image ? 4 : 10, gap: 4 }}>
            {m.image && <Image source={messageImage(m.image.id)} style={{ width: 220, height: 220 * (m.image.height / m.image.width), borderRadius: 12 }} contentFit="cover" />}
            {m.body ? <T style={{ paddingHorizontal: m.image ? 6 : 0 }}>{m.body}</T> : null}
            <T v="faint" style={{ fontSize: 11, paddingHorizontal: m.image ? 6 : 0 }}>{ago(m.createdAt)}</T>
          </View>
        ))}
      </ScrollView>
      {error && <T style={{ color: c.negative, paddingHorizontal: 12 }}>{error}</T>}
      {conv.canSend === false || conv.other.banned ? (
        <T v="muted" style={{ textAlign: "center", padding: 16, paddingBottom: 16 + insets.bottom }}>{conv.blocked ? t.msg.blocked : t.msg.cannotSend}</T>
      ) : (
        <Row style={{ padding: 10, paddingBottom: 10 + insets.bottom, borderTopWidth: 1, borderTopColor: c.rule, alignItems: "flex-end" }}>
          <Pressable onPress={sendPhoto} disabled={busy} hitSlop={8} accessibilityLabel={t.msg.photo}
            style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: c.raised }}>
            <T style={{ fontSize: 18 }}>＋</T>
          </Pressable>
          <TextInput value={text} onChangeText={setText} placeholder={t.msg.placeholder} placeholderTextColor={c.faint} multiline maxLength={2000}
            style={{ flex: 1, minHeight: 40, maxHeight: 120, borderRadius: 20, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, backgroundColor: c.surface, color: c.text, fontFamily: FONT.regular, fontSize: 15 }} />
          <Pressable onPress={send} disabled={busy || !text.trim()} accessibilityLabel={t.msg.send}
            style={{ height: 40, paddingHorizontal: 16, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: text.trim() ? c.accent : c.raised }}>
            {busy ? <ActivityIndicator color={c.accentInk} /> : <T style={{ fontFamily: FONT.semibold, color: text.trim() ? c.accentInk : c.faint }}>{t.msg.send}</T>}
          </Pressable>
        </Row>
      )}
    </KeyboardAvoidingView>
  );
}

import { CameraView, useCameraPermissions } from "expo-camera";
import { Stack, router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useRef, useState } from "react";
import { TextInput, View } from "react-native";
import { Button, Card, Empty, Pill, Screen, T } from "@/components/ui";
import { api, ApiError, WEB_URL } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { FONT, RADIUS, useTheme } from "@/lib/theme";

interface Scan {
  code: string; pretty: string; expired: boolean; claimed: unknown;
  result: { cpu: { name: string | null; raw: string }; gpu: { name: string | null; raw: string }; ram: unknown[]; drives: unknown[]; display: string | null; laptop?: { model: string | null } | null };
}
interface Mine { id: string; name: string }

/** Mã trong QR của pcdex-scan: …/quet?ma=ABCD2345 (hoặc /en/quet), hoặc người dùng gõ 8 ký tự */
const codeOf = (s: string) => (s.match(/[?&]ma=([A-Za-z0-9-]+)/)?.[1] ?? s).toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Quét mã QR trên pcdex-scan → xem cấu hình đọc được → tạo máy mới hoặc cập nhật máy đang có */
export default function ScanScreen() {
  const { t } = useI18n();
  const { user } = useSession();
  const c = useTheme();
  const [perm, requestPerm] = useCameraPermissions();
  const [typed, setTyped] = useState("");
  const [scan, setScan] = useState<Scan | null>(null);
  const [machines, setMachines] = useState<Mine[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handled = useRef(false);
  const T_ = t.scan;

  if (user === null) return <Screen><Empty text={t.auth.needLogin}><Button kind="primary" title={t.common.login} onPress={() => router.replace("/dang-nhap")} /></Empty></Screen>;

  const lookup = async (raw: string) => {
    const code = codeOf(raw);
    if (code.length < 8 || busy) return;
    setBusy(true); setError(null);
    try {
      const s = await api<Scan>(`/v1/scans/${code}`);
      if (s.expired || s.claimed) { setError(T_.expired); handled.current = false; }
      else { setScan(s); setMachines((await api<{ machines: Mine[] }>("/v1/me/machines")).machines); }
    } catch (e) { setError((e as ApiError).message); handled.current = false; }
    setBusy(false);
  };
  const claim = async (machineId: string | null) => {
    if (!scan) return;
    setBusy(true); setError(null);
    try {
      await api(`/v1/scans/${scan.code}/claim`, { body: { machineId } });
      router.dismissAll();
      router.replace("/may");
    } catch (e) { setError((e as ApiError).message); }
    setBusy(false);
  };

  if (scan) {
    const r = scan.result;
    const unknown = !r.cpu.name || !r.gpu.name;
    return (
      <Screen>
        <Stack.Screen options={{ title: T_.found }} />
        <Card>
          <T v="label">{T_.code} {scan.pretty}</T>
          {r.laptop && <Pill tone="accent">{t.machine.laptop}{r.laptop.model ? ` · ${r.laptop.model}` : ""}</Pill>}
          <T style={{ fontFamily: FONT.semibold }}>CPU: {r.cpu.name ?? r.cpu.raw}</T>
          <T style={{ fontFamily: FONT.semibold }}>{t.machine.kinds.gpu}: {r.gpu.name ?? r.gpu.raw}</T>
          {r.display && <T v="muted">{r.display}</T>}
        </Card>
        {unknown ? (
          <Empty text={T_.unknown}><Button kind="primary" title={t.common.openWeb} onPress={() => void WebBrowser.openBrowserAsync(`${WEB_URL}/quet?ma=${scan.code}`)} /></Empty>
        ) : (
          <View style={{ gap: 10 }}>
            {machines.length < 2 ? <Button kind="primary" title={T_.newMachine} busy={busy} onPress={() => void claim(null)} /> : <T v="muted">{T_.full}</T>}
            {machines.map((m) => <Button key={m.id} title={T_.update(m.name)} disabled={busy} onPress={() => void claim(m.id)} />)}
          </View>
        )}
        {error && <T style={{ color: c.negative }}>{error}</T>}
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: T_.title }} />
      <T v="muted">{T_.hint}</T>
      {!perm ? null : perm.granted ? (
        <View style={{ height: 320, borderRadius: RADIUS.card, overflow: "hidden", backgroundColor: "#000" }}>
          <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={busy ? undefined : (res) => { if (!handled.current) { handled.current = true; void lookup(res.data); } }} />
        </View>
      ) : (
        <Empty text={T_.permission}><Button kind="primary" title={T_.allow} onPress={() => void requestPerm()} /></Empty>
      )}
      <Card>
        <T v="label">{T_.code}</T>
        <TextInput value={typed} onChangeText={setTyped} placeholder="ABCD-2345" placeholderTextColor={c.faint} autoCapitalize="characters" maxLength={12}
          accessibilityLabel={T_.code}
          style={{ height: 48, borderRadius: RADIUS.inner, paddingHorizontal: 14, backgroundColor: c.raised, color: c.text, fontFamily: FONT.semibold, fontSize: 18, letterSpacing: 2 }} />
        <Button title={T_.lookup} busy={busy} disabled={codeOf(typed).length < 8} onPress={() => void lookup(typed)} />
      </Card>
      {error && <T style={{ color: c.negative }}>{error}</T>}
    </Screen>
  );
}

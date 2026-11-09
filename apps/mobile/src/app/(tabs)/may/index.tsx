import { Stack, router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useState } from "react";
import { MachineView, type MachineData } from "@/components/machine";
import { Button, Empty, Loading, Screen, Segmented, T } from "@/components/ui";
import { api, ApiError, WEB_URL } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";

/** Máy của tôi: các máy trên tài khoản (tối đa 2), điểm và cấu hình. Sửa cấu hình chi tiết làm trên web. */
export default function MyMachine() {
  const { t } = useI18n();
  const { user } = useSession();
  const [machines, setMachines] = useState<MachineData[] | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api<{ machines: MachineData[] }>("/v1/me/machines");
      setMachines(r.machines);
      setError(null);
    } catch (e) { setError((e as ApiError).message); }
  }, []);
  useEffect(() => {
    if (!user) return;
    let live = true;
    api<{ machines: MachineData[] }>("/v1/me/machines").then((r) => { if (live) { setMachines(r.machines); setError(null); } })
      .catch((e: ApiError) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [user]);

  const header = <Stack.Screen options={{ title: t.machine.title, headerLargeTitle: true }} />;
  if (user === undefined) return <>{header}<Loading /></>;
  if (user === null) return (
    <Screen>{header}
      <Empty text={t.machine.guest}><Button kind="primary" title={t.common.login} onPress={() => router.push("/dang-nhap")} /></Empty>
    </Screen>
  );
  if (error && !machines) return <Screen>{header}<Empty text={error}><Button title={t.common.retry} onPress={() => void load()} /></Empty></Screen>;
  if (!machines) return <>{header}<Loading /></>;
  if (machines.length === 0) return (
    <Screen>{header}
      <Empty text={t.machine.empty}>
        <T v="muted">{t.machine.emptyHint}</T>
        <Button kind="primary" title={t.machine.scan} onPress={() => router.push("/quet")} />
        <Button title={t.machine.addOnWeb} onPress={() => void WebBrowser.openBrowserAsync(`${WEB_URL}/may`)} />
      </Empty>
    </Screen>
  );
  const m = machines.find((x) => x.id === active) ?? machines[0]!;
  return (
    <Screen refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}>
      {header}
      {machines.length > 1 && <Segmented value={m.id} options={machines.map((x) => [x.id, x.name] as [string, string])} onChange={setActive} />}
      <MachineView m={m} />
      <Button title={t.machine.scan} onPress={() => router.push("/quet")} />
      <Button title={t.machine.editOnWeb} onPress={() => void WebBrowser.openBrowserAsync(`${WEB_URL}/may`)} />
    </Screen>
  );
}

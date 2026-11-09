import { NativeTabs } from "expo-router/native-tabs";
import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";

/** 5 tab (Android tối đa 5): Máy, Xếp hạng, Chợ, Tin nhắn (huy hiệu số chưa đọc), Tôi */
export default function TabsLayout() {
  const { t } = useI18n();
  const { user } = useSession();
  const c = useTheme();
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (!user) return;
    const check = () => { api<{ unread: number }>("/v1/messages/unread").then((r) => setUnread(r.unread)).catch(() => {}); };
    check();
    const timer = setInterval(check, 30_000);
    const sub = AppState.addEventListener("change", (s) => { if (s === "active") check(); });
    return () => { clearInterval(timer); sub.remove(); };
  }, [user]);

  return (
    <NativeTabs backgroundColor={c.surface} indicatorColor={c.accentSoft} labelStyle={{ selected: { color: c.text } }} tintColor={c.accent}>
      <NativeTabs.Trigger name="may">
        <NativeTabs.Trigger.Label>{t.tabs.machine}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "cpu", selected: "cpu.fill" }} md="memory" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="xep-hang">
        <NativeTabs.Trigger.Label>{t.tabs.board}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "trophy", selected: "trophy.fill" }} md="emoji_events" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="cho">
        <NativeTabs.Trigger.Label>{t.tabs.market}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "bag", selected: "bag.fill" }} md="storefront" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="tin-nhan">
        <NativeTabs.Trigger.Label>{t.tabs.messages}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "bubble.left.and.bubble.right", selected: "bubble.left.and.bubble.right.fill" }} md="chat" />
        {user && unread > 0 && <NativeTabs.Trigger.Badge>{unread > 9 ? "9+" : String(unread)}</NativeTabs.Trigger.Badge>}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="toi">
        <NativeTabs.Trigger.Label>{t.tabs.me}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "person.crop.circle", selected: "person.crop.circle.fill" }} md="account_circle" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

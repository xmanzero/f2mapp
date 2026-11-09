import { ActionSheetIOS, Alert, Platform } from "react-native";
import { api, ApiError } from "@/lib/api";

type Dict = {
  safety: { block: string; unblock: string; report: string; blockConfirm: (n: string) => string; reportTitle: string; sent: string; reasons: Record<string, string> };
  common: { cancel: string };
};
const REASONS = ["spam", "scam", "harassment", "inappropriate", "other"] as const;

/** Chọn một mục (iOS: action sheet, Android: hộp thoại) */
function pick(title: string, options: string[], cancel: string): Promise<number | null> {
  return new Promise((ok) => {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions({ title, options: [...options, cancel], cancelButtonIndex: options.length }, (i) => ok(i === options.length ? null : i));
    } else {
      Alert.alert(title, undefined, [...options.map((o, i) => ({ text: o, onPress: () => ok(i) })), { text: cancel, style: "cancel" as const, onPress: () => ok(null) }], { cancelable: true, onDismiss: () => ok(null) });
    }
  });
}

/**
 * Menu Chặn / Báo cáo cho một người dùng. Báo cáo từ hội thoại gửi kèm conversationId (quản trị viên đọc được hội thoại đó).
 * Trả về trạng thái chặn mới (hoặc null nếu không đổi).
 */
export async function safetyMenu(t: Dict, who: { handle: string; name: string; blocked: boolean; conversationId?: string }): Promise<boolean | null> {
  const T = t.safety;
  const i = await pick(who.name, [T.report, who.blocked ? T.unblock : T.block], t.common.cancel);
  if (i === null) return null;
  try {
    if (i === 0) {
      const r = await pick(T.reportTitle, REASONS.map((x) => T.reasons[x]!), t.common.cancel);
      if (r === null) return null;
      await api("/v1/reports", { body: { handle: who.handle, conversationId: who.conversationId, reason: REASONS[r] } });
      Alert.alert(T.sent);
      return null;
    }
    if (!who.blocked) {
      const yes = await new Promise<boolean>((ok) => Alert.alert(T.block, T.blockConfirm(who.name), [
        { text: t.common.cancel, style: "cancel", onPress: () => ok(false) }, { text: T.block, style: "destructive", onPress: () => ok(true) },
      ]));
      if (!yes) return null;
    }
    const r = await api<{ blocked: boolean }>(`/v1/users/${encodeURIComponent(who.handle)}/block`, { method: who.blocked ? "DELETE" : "POST", body: {} });
    return r.blocked;
  } catch (e) {
    Alert.alert((e as ApiError).message);
    return null;
  }
}

import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/** Lưu nhỏ (token phiên, ngôn ngữ): SecureStore trên điện thoại, localStorage khi chạy web (chỉ để xem thử) */
export const storage = {
  async get(key: string): Promise<string | null> {
    if (Platform.OS === "web") { try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; } }
    return SecureStore.getItemAsync(key).catch(() => null);
  },
  async set(key: string, value: string) {
    if (Platform.OS === "web") { try { globalThis.localStorage?.setItem(key, value); } catch { /* bỏ qua */ } return; }
    await SecureStore.setItemAsync(key, value).catch(() => {});
  },
  async remove(key: string) {
    if (Platform.OS === "web") { try { globalThis.localStorage?.removeItem(key); } catch { /* bỏ qua */ } return; }
    await SecureStore.deleteItemAsync(key).catch(() => {});
  },
};

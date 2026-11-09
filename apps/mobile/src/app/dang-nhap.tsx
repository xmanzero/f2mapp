import { Stack, router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, TextInput } from "react-native";
import { Button, Card, Screen, T } from "@/components/ui";
import { ApiError, WEB_URL } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { FONT, RADIUS, useTheme } from "@/lib/theme";

/** Đăng nhập / tạo tài khoản bằng email + mật khẩu (quên mật khẩu xử lý trên web) */
export default function Login() {
  const { t } = useI18n();
  const { login, register } = useSession();
  const c = useTheme();
  const [isNew, setIsNew] = useState(useLocalSearchParams<{ moi?: string }>().moi === "1");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = { height: 48, borderRadius: RADIUS.inner, paddingHorizontal: 14, backgroundColor: c.raised, color: c.text, fontFamily: FONT.regular, fontSize: 16 } as const;

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      if (isNew) await register(email.trim(), password, name.trim() || email.split("@")[0]!);
      else await login(email.trim(), password);
      router.back();
    } catch (e) { setError((e as ApiError).message); }
    setBusy(false);
  };
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Stack.Screen options={{ title: "" }} />
      <Screen>
        <T v="title">{isNew ? t.auth.registerTitle : t.auth.title}</T>
        <Card>
          {isNew && <TextInput style={input} placeholder={t.auth.name} placeholderTextColor={c.faint} value={name} onChangeText={setName} maxLength={40} accessibilityLabel={t.auth.name} />}
          <TextInput style={input} placeholder={t.auth.email} placeholderTextColor={c.faint} value={email} onChangeText={setEmail}
            autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" accessibilityLabel={t.auth.email} />
          <TextInput style={input} placeholder={t.auth.password} placeholderTextColor={c.faint} value={password} onChangeText={setPassword}
            secureTextEntry autoComplete={isNew ? "new-password" : "current-password"} textContentType={isNew ? "newPassword" : "password"} accessibilityLabel={t.auth.password}
            onSubmitEditing={submit} />
          {error && <T style={{ color: c.negative }}>{error}</T>}
          <Button kind="primary" title={isNew ? t.auth.submitRegister : t.auth.submit} busy={busy} disabled={!email || !password} onPress={submit} />
        </Card>
        <Button title={isNew ? t.auth.toLogin : t.auth.toRegister} onPress={() => { setIsNew(!isNew); setError(null); }} />
        {!isNew && <Button title={t.auth.forgot} onPress={() => void WebBrowser.openBrowserAsync(`${WEB_URL}/quen-mat-khau`)} />}
      </Screen>
    </KeyboardAvoidingView>
  );
}

import { Stack, router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Avatar, Button, Card, Empty, Loading, Row, Screen, Segmented, T } from "@/components/ui";
import { WEB_URL } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { FONT } from "@/lib/theme";
import { View } from "react-native";

/** Tôi: tài khoản, hồ sơ công khai, bảng tin, quét mã, ngôn ngữ, đăng xuất */
export default function Me() {
  const { t, locale, setLocale } = useI18n();
  const { user, logout } = useSession();
  const header = <Stack.Screen options={{ title: t.me.title, headerLargeTitle: true }} />;
  const lang = (
    <Card>
      <T v="label">{t.me.language}</T>
      <Segmented value={locale} options={[["vi", "Tiếng Việt"], ["en", "English"]]} onChange={setLocale} />
    </Card>
  );
  if (user === undefined) return <>{header}<Loading /></>;
  if (user === null) return (
    <Screen>{header}
      <Empty text={t.me.guest}>
        <Button kind="primary" title={t.common.login} onPress={() => router.push("/dang-nhap")} />
        <Button title={t.common.register} onPress={() => router.push({ pathname: "/dang-nhap", params: { moi: "1" } })} />
      </Empty>
      {lang}
    </Screen>
  );
  return (
    <Screen>
      {header}
      <Card>
        <Row>
          <Avatar name={user.displayName} size={52} accent />
          <View style={{ flex: 1 }}>
            <T style={{ fontFamily: FONT.semibold, fontSize: 18 }}>{user.displayName}</T>
            <T v="faint">@{user.handle}{user.province ? ` · ${user.province}` : ""}</T>
          </View>
        </Row>
        <Button title={t.me.profile} onPress={() => router.push({ pathname: "/u/[handle]", params: { handle: user.handle } })} />
        <Button title={t.me.feed} onPress={() => router.push("/bang-tin")} />
        <Button title={t.me.scan} onPress={() => router.push("/quet")} />
      </Card>
      {lang}
      <Button title={t.me.web} onPress={() => void WebBrowser.openBrowserAsync(`${WEB_URL}/tai-khoan`)} />
      <Button kind="danger" title={t.common.logout} onPress={() => void logout()} />
    </Screen>
  );
}

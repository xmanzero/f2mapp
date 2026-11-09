import { Stack } from "expo-router";
import { FONT, useTheme } from "@/lib/theme";

export default function TabStack() {
  const c = useTheme();
  return (
    <Stack screenOptions={{
      headerStyle: { backgroundColor: c.ground }, headerTintColor: c.text, headerShadowVisible: false,
      headerTitleStyle: { fontFamily: FONT.semibold }, headerLargeTitleStyle: { fontFamily: FONT.display }, contentStyle: { backgroundColor: c.ground },
    }} />
  );
}

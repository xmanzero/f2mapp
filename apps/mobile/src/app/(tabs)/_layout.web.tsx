import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps } from "expo-router/ui";
import { Pressable, Text, View, type PressableProps } from "react-native";
import { useI18n } from "@/lib/i18n";
import { FONT, useTheme } from "@/lib/theme";

/** Bản web (chỉ để xem thử app trên trình duyệt): NativeTabs không chạy trên web → thanh tab dưới đáy bằng expo-router/ui */
export default function WebTabs() {
  const { t } = useI18n();
  const c = useTheme();
  const tabs = [["may", "/may", t.tabs.machine], ["xep-hang", "/xep-hang", t.tabs.board], ["cho", "/cho", t.tabs.market], ["tin-nhan", "/tin-nhan", t.tabs.messages], ["toi", "/toi", t.tabs.me]] as const;
  return (
    <Tabs>
      <TabSlot style={{ flex: 1 }} />
      <TabList asChild>
        <View style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: c.rule, backgroundColor: c.surface }}>
          {tabs.map(([name, href, label]) => (
            <TabTrigger key={name} name={name} href={href} asChild>
              <TabButton>{label}</TabButton>
            </TabTrigger>
          ))}
        </View>
      </TabList>
    </Tabs>
  );
}

function TabButton({ children, isFocused, ...props }: TabTriggerSlotProps) {
  const c = useTheme();
  return (
    <Pressable {...(props as PressableProps)} style={{ flex: 1, height: 56, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontFamily: FONT.semibold, fontSize: 13, color: isFocused ? c.accent : c.faint }}>{children}</Text>
    </Pressable>
  );
}

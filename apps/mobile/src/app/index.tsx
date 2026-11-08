// Màn hình tạm để kiểm tra app dùng được @f2m/shared. Giao diện thật làm ở bước thiết kế (ui-ux-pro-max + taste-skill).
import { ANCHOR_CPU, ANCHOR_GPU, evaluate, resolveMachine, SCALE_VERSION } from '@f2m/shared';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';

const result = evaluate(
  resolveMachine({ cpu: ANCHOR_CPU, gpu: ANCHOR_GPU, ramGb: 16, ramChannels: 2, storage: 'nvme3', pcieGen: 4, psuW: 550, resolution: 1080 }),
);

export default function HomeScreen() {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title">pcdex</ThemedText>
        <ThemedText type="small">
          Thang điểm v{SCALE_VERSION} · máy mốc {ANCHOR_CPU} + {ANCHOR_GPU}
        </ThemedText>
        <ThemedText type="title">{Math.round(result.scores.power).toLocaleString('vi-VN')}</ThemedText>
        <ThemedText>Hạng {result.tier.name}</ThemedText>
        <ThemedView type="backgroundElement" style={styles.list}>
          {result.needs.map((n) => (
            <ThemedText key={n.need} type="small">
              {n.label}: {n.levelLabel} · {n.detail}
            </ThemedText>
          ))}
        </ThemedView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', flexDirection: 'row' },
  safeArea: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.three,
    maxWidth: MaxContentWidth,
  },
  list: { gap: Spacing.two, padding: Spacing.three, borderRadius: Spacing.three },
});

import type { MachineSpec, PartKind } from "@f2m/shared";
import type { MachineBench } from "@/components/bench-card";
import type { Listing } from "./listings";

/** Hồ sơ công khai /u/<tên> (GET /v1/users/:handle) */
export interface ProfileMachine {
  id: string; name: string; isPrimary: boolean; spec: MachineSpec; lastScanAt: string | null; bench: MachineBench | null;
  power: number | null; tier: string | null; likes: number; liked: boolean;
  parts: { kind: PartKind; label: string; verified: boolean }[];
}
export interface PublicProfile {
  user: { id: string; handle: string; displayName: string; province: string | null; joinedAt: string };
  me: boolean; following: boolean; blocked?: boolean; followers: number; followingCount: number; rank: { rank: number; of: number; laptop: boolean } | null;
  machines: ProfileMachine[];
  listings: Listing[];
}
export interface FollowRow { handle: string; displayName: string; province: string | null; power: number | null; tier: string | null; since: string }

/** Địa chỉ hồ sơ (chưa có tiền tố ngôn ngữ — bọc bằng p()) */
export const profilePath = (handle: string) => `/u/${encodeURIComponent(handle)}`;

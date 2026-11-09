/** Kiểu dữ liệu API dùng trong app (khớp phản hồi của apps/api) */
export interface Listing {
  id: string; kind: string; name: string; priceVnd: number; condition: string; warrantyMonths: number | null; province: string | null;
  description: string | null; status: string; createdAt: string; expiresAt: string;
  seller: { id: string; handle: string; displayName: string };
  source: { machine: string; tier: string | null; power: number | null; inUse: boolean; verified: boolean } | null;
  photos: string[]; mine: boolean; contact: string | null; contactHidden: boolean;
}
export interface Conv {
  id: string; lastMessageAt: string; unread: number;
  other: { handle: string; displayName: string; banned: boolean };
  listing: { id: string; name: string; priceVnd: number | null; status: string | null; province: string | null; photo: string | null } | null;
  last: { body: string; mine: boolean; image?: boolean } | null;
  blocked?: boolean; canSend?: boolean;
}
export interface Msg { id: string; body: string; createdAt: string; mine: boolean; read: boolean; image: { id: string; width: number; height: number } | null }

import type { Life } from "@/lib/listings";
import { useI18n } from "@/i18n/client";

/** Thanh thời gian còn lại của tin: màu theo vòng đời (mới đăng màu dữ liệu, đang bán xám, sắp hết hạn cam) */
export function LifeBar({ life, compact }: { life: Life; compact?: boolean }) {
  const { t } = useI18n();
  const L = t.listing;
  return (
    <span className={`life life-${life.state}${compact ? " compact" : ""}`} title={`${L.life[life.state]} · ${L.endsAt(L.end(life.expires))}`}>
      <span className="life-text">
        {!compact && <span className="life-end num">{L.endsAt(L.end(life.expires))}</span>}
        <span className="life-left">{life.state === "new" ? L.newPrefix : ""}{L.remaining(life.remaining)}</span>
      </span>
      <span className="life-track" aria-hidden="true"><span style={{ width: `${life.fraction * 100}%` }} /></span>
    </span>
  );
}

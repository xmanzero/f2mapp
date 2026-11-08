import { endLabel, LIFE_LABEL, remainingLabel, type Life } from "@/lib/listings";

/** Thanh thời gian còn lại của tin: màu theo vòng đời (mới đăng màu dữ liệu, đang bán xám, sắp hết hạn cam) */
export function LifeBar({ life, compact }: { life: Life; compact?: boolean }) {
  return (
    <span className={`life life-${life.state}${compact ? " compact" : ""}`} title={`${LIFE_LABEL[life.state]} · kết thúc ${endLabel(life.expires)}`}>
      <span className="life-text">
        {!compact && <span className="life-end num">Kết thúc {endLabel(life.expires)}</span>}
        <span className="life-left">{life.state === "new" ? "Mới đăng · " : ""}{remainingLabel(life.remaining)}</span>
      </span>
      <span className="life-track" aria-hidden="true"><span style={{ width: `${life.fraction * 100}%` }} /></span>
    </span>
  );
}

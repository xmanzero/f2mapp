"use client";

import { ChevronLeft, ChevronRight, ImagePlus, Maximize2, Star, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MAX_PHOTOS } from "@/lib/photos";

export interface PickedPhoto { key: string; src: string; busy?: boolean }

/** Chọn ảnh linh kiện (tối đa 5). Ảnh đầu là ảnh bìa trên chợ. */
export function PhotoPicker({ items, onAdd, onRemove, onCover, disabled, error }: {
  items: PickedPhoto[]; onAdd: (files: File[]) => void; onRemove: (key: string) => void; onCover: (key: string) => void;
  disabled?: boolean; error?: string | null;
}) {
  const input = useRef<HTMLInputElement>(null);
  const left = MAX_PHOTOS - items.length;
  return (
    <div className="field">
      <span className="label-like" id="photos-label">Ảnh linh kiện <span className="faint">({items.length}/{MAX_PHOTOS})</span></span>
      <ul className="photo-pick" aria-labelledby="photos-label">
        {items.map((p, i) => (
          <li key={p.key} className={p.busy ? "busy" : undefined}>
            {/* eslint-disable-next-line @next/next/no-img-element -- ảnh người dùng tải lên, không qua tối ưu ảnh của Next */}
            <img src={p.src} alt={`Ảnh ${i + 1}`} />
            {i === 0 ? <span className="photo-cover">Ảnh bìa</span>
              : <button type="button" className="photo-btn star" onClick={() => onCover(p.key)} disabled={disabled} aria-label={`Đặt ảnh ${i + 1} làm ảnh bìa`}><Star aria-hidden="true" /></button>}
            <button type="button" className="photo-btn del" onClick={() => onRemove(p.key)} disabled={disabled} aria-label={`Bỏ ảnh ${i + 1}`}><X aria-hidden="true" /></button>
          </li>
        ))}
        {left > 0 && (
          <li>
            <button type="button" className="photo-add" onClick={() => input.current?.click()} disabled={disabled}>
              <ImagePlus aria-hidden="true" />
              <span>Thêm ảnh</span>
            </button>
          </li>
        )}
      </ul>
      <input ref={input} type="file" accept="image/*" multiple hidden
        onChange={(e) => { const fs = [...(e.target.files ?? [])].slice(0, left); e.target.value = ""; if (fs.length) onAdd(fs); }} />
      <span className="hint">Ảnh thật của linh kiện giúp bán nhanh hơn. Ảnh được thu nhỏ và bỏ thông tin vị trí trước khi gửi.</span>
      {error && <p className="form-error" role="alert" style={{ marginTop: 0 }}>{error}</p>}
    </div>
  );
}

/** Xem ảnh tin rao: ảnh lớn + dải ảnh nhỏ, phím trái / phải để chuyển. Bấm ảnh để phóng to ngay trên trang. */
export function Gallery({ urls, name }: { urls: string[]; name: string }) {
  const [i, setI] = useState(0);
  const [zoom, setZoom] = useState(false);
  const box = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = box.current;
    if (!d) return;
    if (zoom && !d.open) d.showModal();
    if (!zoom && d.open) d.close();
  }, [zoom]);
  if (urls.length === 0) return <div className="gallery-empty">Người bán chưa đăng ảnh</div>;
  const at = Math.min(i, urls.length - 1);
  const go = (d: number) => setI((at + d + urls.length) % urls.length);
  const keys = (e: React.KeyboardEvent) => { if (e.key === "ArrowLeft") go(-1); if (e.key === "ArrowRight") go(1); };
  const nav = urls.length > 1 && (
    <>
      <button type="button" className="gallery-nav prev" onClick={() => go(-1)} aria-label="Ảnh trước"><ChevronLeft aria-hidden="true" /></button>
      <button type="button" className="gallery-nav next" onClick={() => go(1)} aria-label="Ảnh sau"><ChevronRight aria-hidden="true" /></button>
      <span className="gallery-count num">{at + 1}/{urls.length}</span>
    </>
  );
  return (
    <div className="gallery" onKeyDown={keys}>
      <div className="gallery-main">
        <button type="button" className="gallery-open" onClick={() => setZoom(true)} aria-label="Phóng to ảnh">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={urls[at]} alt={`${name}, ảnh ${at + 1}/${urls.length}`} />
          <span className="gallery-zoom" aria-hidden="true"><Maximize2 /></span>
        </button>
        {nav}
      </div>
      {urls.length > 1 && (
        <div className="gallery-thumbs" role="group" aria-label="Chọn ảnh">
          {urls.map((u, k) => (
            <button type="button" key={u} aria-pressed={k === at} onClick={() => setI(k)} aria-label={`Ảnh ${k + 1}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
      <dialog ref={box} className="lightbox" aria-label={`Ảnh ${name}`} onClose={() => setZoom(false)}
        onClick={(e) => { if (e.target === e.currentTarget) setZoom(false); }}>
        {zoom && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={urls[at]} alt={`${name}, ảnh ${at + 1}/${urls.length}`} />
            {nav}
            <button type="button" className="gallery-nav lightbox-close" onClick={() => setZoom(false)} aria-label="Đóng" autoFocus><X aria-hidden="true" /></button>
          </>
        )}
      </dialog>
    </div>
  );
}

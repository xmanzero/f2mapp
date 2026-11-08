"use client";

import { ChevronDown, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

/** Bỏ dấu tiếng Việt để gõ "hai phong", "hp" vẫn tìm ra "Hải Phòng" */
export const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().trim();
/** Khớp: chứa chuỗi gõ (không dấu), hoặc gõ chữ cái đầu mỗi từ ("hcm", "hp", "dn") */
function matches(label: string, q: string) {
  const l = fold(label), f = fold(q).replace(/\s+/g, " ");
  if (!f) return true;
  if (l.includes(f)) return true;
  const initials = l.replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean).map((w) => w[0]).join("");
  return initials.startsWith(f.replace(/\s/g, ""));
}

export interface ComboOption { value: string; label: string; hint?: string }

/**
 * Ô chọn có gõ tìm (combobox). Bấm hoặc gõ để lọc, ↑ ↓ để di chuyển, Enter để chọn, Esc để đóng.
 * Gõ không dấu cũng được.
 */
export function Combo({ id, value, options, onChange, placeholder = "Gõ để tìm…", ariaLabel, className, disabled }: {
  id?: string; value: string; options: ComboOption[]; onChange: (v: string) => void;
  placeholder?: string; ariaLabel?: string; className?: string; disabled?: boolean;
}) {
  const auto = useId();
  const inputId = id ?? `combo-${auto}`;
  const listId = `${inputId}-list`;
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const current = options.find((o) => o.value === value);
  const shown = useMemo(() => options.filter((o) => matches(o.label, q)), [options, q]);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  useEffect(() => { list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" }); }, [active, open]);

  const openList = () => {
    if (disabled) return;
    setQ(""); setOpen(true);
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
  };
  const pick = (o: ComboOption) => { onChange(o.value); setOpen(false); setQ(""); };

  return (
    <div ref={wrap} className={`combo${open ? " open" : ""}${className ? ` ${className}` : ""}`}>
      <Search className="combo-icon" aria-hidden="true" />
      <input id={inputId} className="input" role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list"
        aria-label={ariaLabel} aria-activedescendant={open && shown[active] ? `${listId}-${active}` : undefined}
        autoComplete="off" spellCheck={false} disabled={disabled}
        value={open ? q : current?.label ?? ""} placeholder={open ? (current?.label ?? placeholder) : placeholder}
        onFocus={openList} onClick={() => !open && openList()}
        onChange={(e) => { setQ(e.target.value); setActive(0); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); if (!open) openList(); else setActive((a) => Math.min(shown.length - 1, a + 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
          else if (e.key === "Enter") { if (open && shown[active]) { e.preventDefault(); pick(shown[active]); } }
          else if (e.key === "Escape") { if (open) { e.preventDefault(); setOpen(false); setQ(""); } }
          else if (e.key === "Tab") setOpen(false);
        }} />
      <ChevronDown className="combo-chev" aria-hidden="true" />
      {open && (
        <ul ref={list} id={listId} role="listbox" className="combo-list">
          {shown.length === 0 ? <li className="combo-empty">Không có “{q}”</li> : shown.map((o, i) => (
            <li key={o.value} id={`${listId}-${i}`} data-i={i} role="option" aria-selected={o.value === value}
              className={i === active ? "active" : undefined}
              onPointerDown={(e) => e.preventDefault()} onClick={() => pick(o)} onPointerMove={() => setActive(i)}>
              <span>{o.label}</span>{o.hint && <span className="faint">{o.hint}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

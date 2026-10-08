"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** A short note opened from a small control. Click toggles it. Clicking away closes it. */
export function NotePop({ text, label }: { text: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<{ top: number; left: number; width: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;

    function place() {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(288, window.innerWidth - 24);
      let left = rect.left;
      if (left + width > window.innerWidth - 12) left = window.innerWidth - 12 - width;
      if (left < 12) left = 12;
      const below = rect.bottom + 6;
      const roomBelow = window.innerHeight - below;
      const top = roomBelow < 96 && rect.top > 120 ? Math.max(12, rect.top - 8 - 96) : below;
      setBox({ top, left, width });
    }

    place();

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    }

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-[#0f6b56] bg-white text-[11px] leading-none font-semibold text-[#0f6b56]"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`Note for ${label}`}
        onClick={() => setOpen((current) => !current)}
      >
        ?
      </button>
      {open && box
        ? createPortal(
            <div
              ref={panelRef}
              id={panelId}
              data-note-pop=""
              role="note"
              className="fixed z-50 rounded-lg bg-[#f7f3ea] px-3 py-2 text-sm leading-relaxed text-[#144237] shadow-md ring-1 ring-[#0f6b56]/30"
              style={{ top: box.top, left: box.left, width: box.width }}
            >
              {text}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IconClose } from "./icons";
import { Button, IconButton } from "./primitives";

// กล่องซ้อนหน้าจอ
//
// ทั้ง Modal และ Sheet ใช้โครงเดียวกัน ต่างกันแค่ตำแหน่งและการเข้า
// จอเล็กใช้ Sheet ที่เลื่อนขึ้นจากด้านล่างเพราะนิ้วโป้งเอื้อมถึงง่ายกว่าตรงกลางจอ
// จอใหญ่ใช้ Modal กลางจอเพราะสายตาอยู่กลางอยู่แล้ว

function useDismiss(onClose: () => void, open: boolean) {
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);

    // กันหน้าเบื้องหลังเลื่อนตามนิ้วขณะที่กล่องเปิดอยู่
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose, open]);
}

type OverlayProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** sheet = เลื่อนขึ้นจากล่าง เหมาะกับมือถือ · modal = กลางจอ เหมาะกับแท็บเล็ตขึ้นไป */
  variant?: "sheet" | "modal";
  size?: "md" | "lg";
};

export function Overlay({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  variant = "modal",
  size = "md",
}: OverlayProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useDismiss(onClose, open);

  // ย้ายโฟกัสเข้ากล่องเมื่อเปิด เพื่อให้คนใช้คีย์บอร์ดและ screen reader ไม่หลงอยู่หลังฉาก
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const width = size === "lg" ? "max-w-2xl" : "max-w-md";

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={[
          "relative flex max-h-[92dvh] w-full flex-col bg-surface shadow-float outline-none",
          width,
          variant === "sheet"
            ? "rounded-t-3xl sm:rounded-3xl"
            : "rounded-t-3xl sm:rounded-2xl",
        ].join(" ")}
      >
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-lg font-bold">{title}</h2>
            {description ? (
              <p className="mt-0.5 text-sm text-ink-faint">{description}</p>
            ) : null}
          </div>
          <IconButton label="ปิด" onClick={onClose} className="-mt-1 -mr-2">
            <IconClose />
          </IconButton>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer ? (
          <footer className="border-t border-line px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

/**
 * กล่องยืนยันก่อนทำสิ่งที่ย้อนยาก
 *
 * ใช้กับการปิดโต๊ะ ยกเลิก Visit และการรับเงิน — สามอย่างที่แก้ทีหลังยากที่สุด
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "ยืนยัน",
  tone = "primary",
  busy = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  tone?: "primary" | "danger";
  busy?: boolean;
}) {
  return (
    <Overlay
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <div className="flex gap-2">
          <Button variant="outline" block onClick={onClose} disabled={busy}>
            ยกเลิก
          </Button>
          <Button variant={tone} block onClick={onConfirm} disabled={busy}>
            {busy ? "กำลังทำ…" : confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="text-[15px] leading-relaxed text-ink-soft">{message}</div>
    </Overlay>
  );
}

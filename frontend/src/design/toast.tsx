import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { IconAlert, IconCheck } from "./icons";

// แจ้งผลการกระทำแบบไม่ขวางทาง
//
// ใช้แทนการแทรกข้อความลงในหน้า เพราะข้อความที่แทรกจะดันเนื้อหาให้ขยับ
// แล้วนิ้วที่กำลังจะกดปุ่มถัดไปพลาดเป้า ซึ่งเป็นปัญหาจริงตอนพนักงานทำงานเร็ว ๆ

type ToastTone = "ok" | "error" | "info";

type Toast = { id: number; tone: ToastTone; message: string };

const ToastContext = createContext<{
  show: (message: string, tone?: ToastTone) => void;
} | null>(null);

const TONE_STYLE: Record<ToastTone, string> = {
  ok: "bg-ok-500 text-white",
  error: "bg-brand-600 text-white",
  info: "bg-ink text-white",
};

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback((message: string, tone: ToastTone = "ok") => {
    const id = nextId++;
    setToasts((list) => [...list, { id, tone, message }]);
    // ข้อความแจ้งผลไม่ควรค้างจนบังเนื้อหา แต่ต้องนานพอให้อ่านจบระหว่างทำงานอย่างอื่น
    window.setTimeout(() => {
      setToasts((list) => list.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div
          className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
          aria-live="polite"
          aria-atomic="false"
        >
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`pointer-events-auto flex max-w-sm items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold shadow-float ${TONE_STYLE[toast.tone]}`}
            >
              {toast.tone === "error" ? (
                <IconAlert className="size-4" />
              ) : (
                <IconCheck className="size-4" />
              )}
              {toast.message}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast ต้องอยู่ภายใต้ ToastProvider");
  return context;
}

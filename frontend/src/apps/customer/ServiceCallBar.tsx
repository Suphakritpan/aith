import { useState } from "react";
import { api, ApiError, newIdempotencyKey } from "../../lib/api";
import type { ServiceCallType, VisitView } from "../../lib/types";
import { SERVICE_CALL_LABEL } from "../../lib/types";

// §04 — เรียกพนักงานจากโต๊ะ
//
// เซิร์ฟเวอร์ตอบ 429 ถ้ากดซ้ำเร็วเกินไป หน้าจอจึงไม่ต้องทำตัวนับเวลาเอง
// แค่แสดงข้อความที่เซิร์ฟเวอร์ส่งกลับมา ความจริงเรื่องเวลาอยู่ที่เดียว

const OPTIONS: { type: ServiceCallType; icon: string }[] = [
  { type: "WATER", icon: "💧" },
  { type: "UTENSIL", icon: "🍽" },
  { type: "OTHER", icon: "🔔" },
];

export default function ServiceCallBar({
  token,
  openCalls,
  onDone,
}: {
  token: string;
  openCalls: VisitView["service_calls"];
  onDone: () => void;
}) {
  const [sending, setSending] = useState<ServiceCallType | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const pending = new Set(openCalls.map((c) => c.type));

  async function call(type: ServiceCallType) {
    setSending(type);
    setMessage(null);
    try {
      await api.callStaff(token, type, newIdempotencyKey());
      setMessage("เรียกพนักงานแล้ว กำลังไปที่โต๊ะ");
      onDone();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "เรียกพนักงานไม่สำเร็จ");
    } finally {
      setSending(null);
      window.setTimeout(() => setMessage(null), 3000);
    }
  }

  return (
    <footer className="sticky bottom-0 border-t border-divider bg-ground/95 px-4 py-3 backdrop-blur">
      {message ? (
        <p className="mb-2 text-center text-xs text-muted-strong" role="status">
          {message}
        </p>
      ) : null}
      <div className="flex gap-2">
        {OPTIONS.map((option) => {
          const waiting = pending.has(option.type);
          return (
            <button
              key={option.type}
              type="button"
              onClick={() => void call(option.type)}
              disabled={sending !== null || waiting}
              className="flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-xl border border-divider bg-surface text-sm font-semibold disabled:opacity-50"
            >
              <span aria-hidden>{option.icon}</span>
              {waiting ? "เรียกแล้ว" : SERVICE_CALL_LABEL[option.type]}
            </button>
          );
        })}
      </div>
    </footer>
  );
}

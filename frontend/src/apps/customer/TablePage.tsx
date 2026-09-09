import { useCallback, useState } from "react";
import { useParams } from "react-router";
import { api, ApiError } from "../../lib/api";
import { usePolling, useNow } from "../../lib/usePolling";
import { elapsedMinutesSince, formatClock } from "../../lib/format";
import { Card, Notice, Spinner } from "../../components/ui";
import MenuTab from "./MenuTab";
import OrdersTab from "./OrdersTab";
import BillTab from "./BillTab";
import ServiceCallBar from "./ServiceCallBar";

// §04 ขั้นที่ 06-11 — หน้าโต๊ะของลูกค้า ปลายทางของ QR
// สิทธิ์ทั้งหมดมาจาก qr_token ในลิงก์ ไม่มีการล็อกอิน (ADR-06)

type Tab = "menu" | "orders" | "bill";

const TABS: { id: Tab; label: string }[] = [
  { id: "menu", label: "เมนู" },
  { id: "orders", label: "ออเดอร์" },
  { id: "bill", label: "บิล" },
];

export default function TablePage() {
  const { token = "" } = useParams();
  const [tab, setTab] = useState<Tab>("menu");

  const fetcher = useCallback((signal: AbortSignal) => api.getVisit(token, signal), [token]);
  const { data, error, loading, refresh } = usePolling(fetcher, 5000, Boolean(token));

  // นาฬิกาเดินในเครื่องเพื่อให้ตัวนับถอยหลังลื่น ไม่ต้องรอรอบ polling
  const now = useNow(1000);

  if (loading && !data) return <Spinner label="กำลังเปิดโต๊ะของคุณ" />;

  if (error) {
    const gone = error instanceof ApiError && (error.isGone || error.status === 404);
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <Card className="text-center">
          <p className="text-2xl font-bold">{gone ? "มื้อนี้จบแล้ว" : "เปิดหน้านี้ไม่ได้"}</p>
          <p className="mt-2 text-sm text-muted-strong">
            {gone
              ? "QR ใบนี้หมดอายุแล้ว หากยังนั่งอยู่ที่โต๊ะ กรุณาเรียกพนักงานเพื่อขอลิงก์ใหม่"
              : error.message}
          </p>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  const { visit } = data;
  const closed = visit.status === "CLOSED" || visit.status === "VOIDED";
  const billLocked = visit.status === "BILL_REQUESTED" || visit.status === "PAID" || closed;

  // นับจาก seated_at ตรง ๆ ตาม BR-04 — นาฬิกาเดียวต่อ Visit
  const elapsed = elapsedMinutesSince(visit.seated_at, now);
  const remaining = Math.max(0, visit.duration_minutes - elapsed);
  const overtime = elapsed > visit.duration_minutes;
  const warning = !overtime && remaining <= 15;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <header className="sticky top-0 z-10 border-b border-divider bg-ground/95 px-4 pt-4 pb-3 backdrop-blur">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className="text-xs text-muted">โต๊ะ</p>
            <p className="text-xl font-bold">{visit.table_nos ?? "—"}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted">{overtime ? "เกินเวลามาแล้ว" : "เหลือเวลา"}</p>
            <p
              className={`tabular text-xl font-bold ${
                overtime ? "text-brand-700" : warning ? "text-amber-700" : "text-ink"
              }`}
            >
              {overtime
                ? formatClock(elapsed - visit.duration_minutes)
                : formatClock(remaining)}
            </p>
          </div>
        </div>

        <nav className="mt-3 flex gap-1 rounded-xl bg-brand-100 p-1" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`min-h-10 flex-1 rounded-lg text-sm font-semibold transition ${
                tab === t.id ? "bg-surface text-brand-700 shadow-sm" : "text-muted-strong"
              }`}
            >
              {t.label}
              {t.id === "orders" && visit.open_item_count > 0 ? (
                <span className="tabular ml-1 text-xs">({visit.open_item_count})</span>
              ) : null}
            </button>
          ))}
        </nav>
      </header>

      <main className="flex-1 space-y-3 px-4 py-4">
        {closed ? (
          <Notice tone="info">
            มื้อนี้ปิดแล้ว ขอบคุณที่มาใช้บริการ — หน้านี้แสดงข้อมูลย้อนหลังเท่านั้น
          </Notice>
        ) : null}

        {overtime ? (
          <Notice tone="error">
            เลยเวลา {visit.duration_minutes} นาทีแล้ว ระบบคิดค่าบุฟเฟต์เพิ่มอีกหนึ่งรอบเต็ม
            กรุณาเรียกพนักงานหากต้องการเช็กบิล
          </Notice>
        ) : warning ? (
          <Notice tone="warn">
            เหลือเวลาอีก {remaining} นาที — สั่งรอบสุดท้ายได้เลย
          </Notice>
        ) : null}

        {tab === "menu" ? (
          <MenuTab
            token={token}
            menu={data.menu}
            addons={data.addons}
            payingPax={visit.paying_pax}
            disabled={billLocked}
            onDone={refresh}
          />
        ) : null}
        {tab === "orders" ? <OrdersTab batches={data.batches} /> : null}
        {tab === "bill" ? (
          <BillTab
            token={token}
            visit={visit}
            pax={data.pax}
            addons={data.addons}
            estimate={data.estimate}
            bill={data.bill}
            onDone={refresh}
          />
        ) : null}
      </main>

      {!closed ? (
        <ServiceCallBar
          token={token}
          openCalls={data.service_calls.filter((c) => c.status !== "DONE")}
          onDone={refresh}
        />
      ) : null}
    </div>
  );
}

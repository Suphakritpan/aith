import { useCallback, useState } from "react";
import { usePolling } from "../../lib/usePolling";
import { fetchDailyReport } from "../../lib/adminQueries";
import { useAuth } from "../../lib/auth";
import { Card, EmptyState, Input, SectionTitle, Spinner, Stat } from "../../design/primitives";
import { formatBaht, formatClock } from "../../lib/format";
import { AdminPage } from "./AdminShell";

// ภาพรวมรายวัน — §09 GET /admin/reports/daily
//
// ตัวเลขสี่ตัวบนสุดคือสิ่งที่เจ้าของร้านดูทุกวัน ส่วนกราฟช่วงเวลาหนาแน่นใช้ตัดสินใจเรื่องกะ
// กราฟวาดด้วย div ธรรมดา ไม่ลากไลบรารีกราฟเข้ามา เพราะข้อมูลมีแค่ 24 แท่ง
// การเพิ่มไลบรารีเพื่อสิ่งนี้จะทำให้บันเดิลใหญ่ขึ้นหลายเท่าโดยไม่ได้อะไรกลับมา

export default function OverviewPage() {
  const { staff } = useAuth();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  const fetcher = useCallback(async () => {
    if (!staff) throw new Error("ยังไม่ได้ล็อกอิน");
    return fetchDailyReport(staff.branch_id, date);
  }, [staff, date]);

  const { data, loading, error } = usePolling(fetcher, 60_000, Boolean(staff));

  if (loading && !data) return <Spinner label="กำลังโหลดรายงาน" />;

  const sales = data?.sales ?? {};
  const busy = data?.busy_hours ?? [];
  const peak = Math.max(1, ...busy.map((b) => b.visits));

  return (
    <AdminPage
      title="ภาพรวม"
      subtitle="ยอดขายและการใช้โต๊ะรายวัน · ไม่นับ Visit ที่ถูกยกเลิก"
      action={
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-auto"
          aria-label="เลือกวันที่"
        />
      }
    >
      {error ? (
        <EmptyState title="โหลดรายงานไม่สำเร็จ" hint={error.message} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat
              label="ยอดขาย"
              value={formatBaht(Number(sales.gross_sales ?? 0))}
              unit="฿"
              tone="brand"
            />
            <Stat label="จำนวนลูกค้า" value={sales.guest_count ?? 0} unit="คน" />
            <Stat label="รอบโต๊ะ" value={sales.visit_count ?? 0} unit="ครั้ง" />
            <Stat
              label="เวลาเฉลี่ยต่อโต๊ะ"
              value={
                sales.avg_turn_minutes ? formatClock(Number(sales.avg_turn_minutes)) : "—"
              }
              hint={
                sales.overtime_rounds
                  ? `มีเกินเวลา ${sales.overtime_rounds} รอบ`
                  : "ไม่มีโต๊ะเกินเวลา"
              }
            />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <Card>
              <SectionTitle>ช่วงเวลาที่คนแน่น</SectionTitle>
              {busy.length === 0 ? (
                <p className="py-8 text-center text-sm text-ink-faint">
                  ยังไม่มีการเช็คอินในวันนี้
                </p>
              ) : (
                <div className="flex h-40 items-end gap-1">
                  {Array.from({ length: 24 }, (_, hour) => {
                    const found = busy.find((b) => b.hour === hour);
                    const value = found?.visits ?? 0;
                    return (
                      <div
                        key={hour}
                        className="flex flex-1 flex-col items-center justify-end gap-1"
                        title={`${hour}:00 — ${value} โต๊ะ`}
                      >
                        <div
                          className={`w-full rounded-t ${value > 0 ? "bg-brand-400" : "bg-line"}`}
                          style={{ height: `${Math.max(2, (value / peak) * 100)}%` }}
                        />
                        {hour % 4 === 0 ? (
                          <span className="tabular text-[10px] text-ink-faint">{hour}</span>
                        ) : (
                          <span className="text-[10px] opacity-0">.</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            <Card>
              <SectionTitle>เมนูที่สั่งเยอะที่สุด</SectionTitle>
              {(data?.top_menu ?? []).length === 0 ? (
                <p className="py-8 text-center text-sm text-ink-faint">
                  ยังไม่มีออเดอร์ในวันนี้
                </p>
              ) : (
                <ol className="divide-y divide-line">
                  {data?.top_menu.map((row, index) => (
                    <li
                      key={row.menu_name}
                      className="flex items-center justify-between gap-3 py-2"
                    >
                      <span className="flex items-center gap-3">
                        <span className="tabular w-5 text-sm font-bold text-ink-faint">
                          {index + 1}
                        </span>
                        {row.menu_name}
                      </span>
                      <span className="tabular font-semibold">{row.ordered_qty} จาน</span>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </div>

          <p className="mt-4 text-xs text-ink-faint">
            เมนูวัดจาก "จำนวนที่สั่ง" ไม่ใช่ยอดเงิน เพราะร้านคิดเงินต่อหัว
            เมนูจึงไม่มีราคาต่อจานให้คิดยอด
          </p>
        </>
      )}
    </AdminPage>
  );
}

import { useCallback } from "react";
import { usePolling } from "../../lib/usePolling";
import { fetchRecentVisits } from "../../lib/adminQueries";
import { Badge, Card, EmptyState, Spinner } from "../../design/primitives";
import { VISIT_STATUS_LABEL, type VisitStatus } from "../../lib/types";
import { formatBaht, formatClock, formatTime } from "../../lib/format";
import { AdminPage } from "./AdminShell";

// ประวัติการขาย — ใช้ตรวจย้อนหลังเมื่อลูกค้าทักมาหรือยอดไม่ตรง
//
// แสดง Visit ที่ยกเลิกด้วย โดยทำเครื่องหมายไว้ชัดเจน เพราะการที่รายการหายไปเฉย ๆ
// คือสิ่งที่ทำให้ตรวจสอบย้อนหลังไม่ได้ ซึ่งขัดกับเหตุผลทั้งหมดของการทำ soft delete

const STATUS_TONE: Partial<Record<VisitStatus, "ok" | "warn" | "neutral" | "brand" | "info">> = {
  CLOSED: "ok",
  VOIDED: "warn",
  BILL_REQUESTED: "info",
  PAID: "info",
  DINING: "brand",
  SEATED: "brand",
};

export default function VisitsPage() {
  const fetcher = useCallback(() => fetchRecentVisits(40), []);
  const { data, loading, error } = usePolling(fetcher, 30_000);

  if (loading && !data) return <Spinner label="กำลังโหลดประวัติ" />;

  return (
    <AdminPage title="ประวัติการขาย" subtitle="40 รายการล่าสุด">
      {error ? (
        <EmptyState title="โหลดข้อมูลไม่สำเร็จ" hint={error.message} />
      ) : (data?.length ?? 0) === 0 ? (
        <EmptyState title="ยังไม่มีรายการ" hint="เมื่อมีการเปิดโต๊ะ ประวัติจะขึ้นที่นี่" />
      ) : (
        <Card padded={false} className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead className="border-b border-line text-left text-xs text-ink-faint">
              <tr>
                <th className="px-4 py-3 font-semibold">เริ่ม</th>
                <th className="px-4 py-3 font-semibold">ปิด</th>
                <th className="px-4 py-3 font-semibold">ใช้เวลา</th>
                <th className="px-4 py-3 font-semibold">สถานะ</th>
                <th className="px-4 py-3 text-right font-semibold">ยอดสุทธิ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data?.map((visit) => {
                const minutes = visit.closed_at
                  ? Math.round(
                      (new Date(visit.closed_at).getTime() -
                        new Date(visit.seated_at).getTime()) /
                        60000,
                    )
                  : null;
                const over = minutes !== null && minutes > visit.duration_minutes;

                return (
                  <tr key={visit.visit_id}>
                    <td className="tabular px-4 py-3">{formatTime(visit.seated_at)}</td>
                    <td className="tabular px-4 py-3">
                      {visit.closed_at ? formatTime(visit.closed_at) : "—"}
                    </td>
                    <td className={`tabular px-4 py-3 ${over ? "text-brand-600" : ""}`}>
                      {minutes !== null ? formatClock(minutes) : "กำลังใช้งาน"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={STATUS_TONE[visit.status as VisitStatus] ?? "neutral"}>
                        {VISIT_STATUS_LABEL[visit.status as VisitStatus] ?? visit.status}
                      </Badge>
                    </td>
                    <td className="tabular px-4 py-3 text-right font-semibold">
                      {visit.bill ? `${formatBaht(visit.bill.net_total)} ฿` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </AdminPage>
  );
}

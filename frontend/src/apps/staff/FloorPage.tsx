import { useCallback, useState } from "react";
import { useNavigate } from "react-router";
import { usePolling, useNow } from "../../lib/usePolling";
import {
  fetchActiveVisits,
  fetchTables,
  setTableStatus,
} from "../../lib/staffQueries";
import { useToast } from "../../design/toast";
import { Badge, Button, Card, Spinner, TimeBar } from "../../design/primitives";
import { TABLE_STATUS_LABEL, type DiningTable, type TableStatus } from "../../lib/types";
import { elapsedMinutesSince, formatClock } from "../../lib/format";
import { StaffPage } from "./StaffShell";
import CheckInDialog from "./CheckInDialog";
import QrDialog from "./QrDialog";

// ผังโต๊ะ — ภาพรวมทั้งร้านในหน้าจอเดียว
//
// สีบอกสถานะและตัวอักษรบอกซ้ำเสมอ เพราะหน้าจอในร้านมักโดนแสงจนสีเพี้ยน
// เรียงตามเลขโต๊ะไม่ใช่ตามสถานะ เพื่อให้ตำแหน่งบนจอตรงกับที่พนักงานจำได้จากพื้นที่จริง

const STATUS_STYLE: Record<TableStatus, { card: string; tone: "ok" | "brand" | "warn" | "info" }> =
  {
    AVAILABLE: { card: "border-ok-100 bg-ok-50", tone: "ok" },
    OCCUPIED: { card: "border-brand-200 bg-brand-50", tone: "brand" },
    CLEANING: { card: "border-warn-100 bg-warn-50", tone: "warn" },
    RESERVED: { card: "border-info-100 bg-info-50", tone: "info" },
  };

export default function FloorPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const now = useNow(30_000);
  const [checkInTable, setCheckInTable] = useState<DiningTable | null>(null);
  const [qrToken, setQrToken] = useState<string | null>(null);

  const fetcher = useCallback(async () => {
    const [tables, visits] = await Promise.all([fetchTables(), fetchActiveVisits()]);
    return { tables, visits };
  }, []);

  const { data, loading, refresh } = usePolling(fetcher, 10_000);

  async function release(tableId: string, tableNo: string) {
    try {
      await setTableStatus(tableId, "AVAILABLE");
      toast.show(`โต๊ะ ${tableNo} พร้อมรับลูกค้าแล้ว`);
      refresh();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "เปลี่ยนสถานะไม่สำเร็จ", "error");
    }
  }

  if (loading && !data) return <Spinner label="กำลังโหลดผังโต๊ะ" />;
  if (!data) return null;

  // จับคู่โต๊ะกับ Visit ที่กำลังใช้อยู่ เพื่อแสดงเวลาบนการ์ดโต๊ะได้เลย
  const visitByTable = new Map<string, (typeof data.visits)[number]>();
  for (const visit of data.visits) {
    for (const tableNo of (visit.table_nos ?? "").split(",")) {
      const key = tableNo.trim();
      if (key) visitByTable.set(key, visit);
    }
  }

  const counts = data.tables.reduce<Record<string, number>>((acc, t) => {
    acc[t.status] = (acc[t.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <StaffPage
      title="ผังโต๊ะ"
      subtitle={`ว่าง ${counts.AVAILABLE ?? 0} · มีลูกค้า ${counts.OCCUPIED ?? 0} · รอเก็บ ${counts.CLEANING ?? 0}`}
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {data.tables.map((table) => {
          const style = STATUS_STYLE[table.status];
          const visit = visitByTable.get(table.table_no);
          const elapsed = visit ? elapsedMinutesSince(visit.seated_at, now) : 0;
          const over = visit ? elapsed > visit.duration_minutes : false;

          return (
            <Card key={table.table_id} className={`${style.card} flex flex-col`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-2xl font-bold">{table.table_no}</p>
                  <p className="tabular text-xs text-ink-faint">
                    {table.seat_capacity} ที่นั่ง
                  </p>
                </div>
                <Badge tone={style.tone}>{TABLE_STATUS_LABEL[table.status]}</Badge>
              </div>

              {visit ? (
                <div className="mt-3">
                  <TimeBar elapsed={elapsed} duration={visit.duration_minutes} />
                  <p
                    className={`tabular mt-1.5 text-sm font-semibold ${over ? "text-brand-600" : "text-ink-soft"}`}
                  >
                    {over
                      ? `เกิน ${formatClock(elapsed - visit.duration_minutes)}`
                      : `เหลือ ${formatClock(visit.duration_minutes - elapsed)}`}
                  </p>
                  <p className="text-xs text-ink-faint">{visit.paying_pax} คน</p>
                </div>
              ) : null}

              <div className="mt-3 flex-1" />

              {table.status === "AVAILABLE" ? (
                <Button size="sm" block onClick={() => setCheckInTable(table)}>
                  เปิดโต๊ะ
                </Button>
              ) : table.status === "CLEANING" ? (
                <Button
                  size="sm"
                  block
                  variant="outline"
                  onClick={() => void release(table.table_id, table.table_no)}
                >
                  เก็บเสร็จแล้ว
                </Button>
              ) : visit ? (
                <Button
                  size="sm"
                  block
                  variant="outline"
                  onClick={() => navigate(`/staff/visit/${visit.visit_id}`)}
                >
                  ดูรายละเอียด
                </Button>
              ) : (
                <Button size="sm" block variant="ghost" disabled>
                  ไม่มีข้อมูล Visit
                </Button>
              )}
            </Card>
          );
        })}
      </div>

      <CheckInDialog
        open={checkInTable !== null}
        onClose={() => setCheckInTable(null)}
        tables={data.tables}
        ticket={null}
        onDone={(result) => {
          setCheckInTable(null);
          setQrToken(result.qr_token);
          refresh();
        }}
      />

      <QrDialog open={qrToken !== null} onClose={() => setQrToken(null)} token={qrToken} />
    </StaffPage>
  );
}

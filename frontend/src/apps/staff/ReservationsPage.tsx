import { useCallback, useState } from "react";
import { usePolling, useNow } from "../../lib/usePolling";
import {
  fetchReservations,
  fetchTables,
  holdTable,
  markReservationSeated,
  releaseReservation,
  type ReservationRow,
} from "../../lib/staffQueries";
import { useToast } from "../../design/toast";
import { Overlay } from "../../design/overlay";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  SectionTitle,
  Spinner,
} from "../../design/primitives";
import { IconClock } from "../../design/icons";
import { StaffPage } from "./StaffShell";
import CheckInDialog from "./CheckInDialog";
import QrDialog from "./QrDialog";

// การจองล่วงหน้า — §06 กลุ่ม 2
//
// การจองไม่ผูกโต๊ะตั้งแต่แรก พนักงานเป็นคนกันโต๊ะให้เมื่อใกล้เวลา
// ร้านกันไว้ 15 นาทีหลังเวลานัด เลยจากนั้นระบบถือว่าหลุดและโต๊ะกลับเข้าสู่คิวปกติ
//
// หน้านี้เรียงตามเวลานัด ไม่ใช่ตามเวลาที่จองเข้ามา เพราะสิ่งที่พนักงานต้องรู้คือ
// "ใครกำลังจะมาถึง" ไม่ใช่ "ใครจองก่อน"

const STATUS: Record<
  ReservationRow["status"],
  { label: string; tone: "info" | "ok" | "neutral" }
> = {
  HELD: { label: "กันโต๊ะไว้", tone: "info" },
  SEATED: { label: "เข้าโต๊ะแล้ว", tone: "ok" },
  RELEASED: { label: "ปล่อยแล้ว", tone: "neutral" },
};

export default function ReservationsPage() {
  const toast = useToast();
  const now = useNow(30_000);
  const [assigning, setAssigning] = useState<ReservationRow | null>(null);
  const [seating, setSeating] = useState<ReservationRow | null>(null);
  const [qrToken, setQrToken] = useState<string | null>(null);

  const fetcher = useCallback(async () => {
    const [reservations, tables] = await Promise.all([fetchReservations(), fetchTables()]);
    return { reservations, tables };
  }, []);

  const { data, loading, refresh } = usePolling(fetcher, 20_000);

  async function act(action: () => Promise<void>, message: string) {
    try {
      await action();
      toast.show(message);
      refresh();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "ทำรายการไม่สำเร็จ", "error");
    }
  }

  if (loading && !data) return <Spinner label="กำลังโหลดการจอง" />;
  if (!data) return null;

  const held = data.reservations.filter((r) => r.status === "HELD");
  const done = data.reservations.filter((r) => r.status !== "HELD");
  const tableName = (id: string | null) =>
    data.tables.find((t) => t.table_id === id)?.table_no ?? null;

  return (
    <StaffPage
      title="การจองล่วงหน้า"
      subtitle={`รออยู่ ${held.length} รายการ · ร้านกันโต๊ะให้ 15 นาทีหลังเวลานัด`}
    >
      {held.length === 0 ? (
        <EmptyState
          icon={<IconClock className="size-8" />}
          title="ยังไม่มีการจองที่รออยู่"
          hint="ลูกค้าจองผ่านหน้า /reserve แล้วรายการจะขึ้นที่นี่"
        />
      ) : (
        <div className="space-y-2">
          {held.map((row) => {
            const when = new Date(row.reserved_for);
            const holdUntil = new Date(row.hold_until);
            const minutesAway = Math.round((when.getTime() - now) / 60000);
            const expired = holdUntil.getTime() < now;
            const arriving = minutesAway <= 30 && minutesAway > -15;

            return (
              <Card
                key={row.reservation_id}
                className={expired ? "border-warn-100 bg-warn-50" : arriving ? "attention" : ""}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="tabular text-xl font-bold">
                      {when.toLocaleString("th-TH", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </p>
                    <p className="text-sm text-ink-soft">
                      {row.party_size} คน
                      {row.contact_phone ? ` · โทร ${row.contact_phone}` : ""}
                    </p>
                    <p className="tabular mt-0.5 text-xs text-ink-faint">
                      {expired
                        ? `เลยเวลากันโต๊ะมาแล้ว (ถึง ${holdUntil.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })})`
                        : minutesAway > 0
                          ? `อีก ${minutesAway} นาทีจะถึงเวลานัด`
                          : `ถึงเวลานัดแล้ว · กันโต๊ะถึง ${holdUntil.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}`}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {row.table_id ? (
                      <Badge tone="info">กันโต๊ะ {tableName(row.table_id)}</Badge>
                    ) : (
                      <Badge tone="neutral">ยังไม่กันโต๊ะ</Badge>
                    )}

                    <Button variant="outline" size="sm" onClick={() => setAssigning(row)}>
                      {row.table_id ? "เปลี่ยนโต๊ะ" : "กันโต๊ะ"}
                    </Button>
                    <Button size="sm" onClick={() => setSeating(row)}>
                      ลูกค้ามาแล้ว
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        void act(
                          () => releaseReservation(row.reservation_id, row.table_id),
                          "ปล่อยการจองแล้ว",
                        )
                      }
                    >
                      ปล่อย
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {done.length > 0 ? (
        <div className="mt-6">
          <SectionTitle>ประวัติล่าสุด</SectionTitle>
          <Card padded={false}>
            <ul className="divide-y divide-line">
              {done.slice(0, 10).map((row) => (
                <li
                  key={row.reservation_id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                >
                  <span className="tabular">
                    {new Date(row.reserved_for).toLocaleString("th-TH", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}{" "}
                    · {row.party_size} คน
                  </span>
                  <Badge tone={STATUS[row.status].tone}>{STATUS[row.status].label}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      ) : null}

      {/* เลือกโต๊ะที่จะกันไว้ */}
      <Overlay
        open={assigning !== null}
        onClose={() => setAssigning(null)}
        title="เลือกโต๊ะที่จะกันไว้"
        description={
          assigning ? `${assigning.party_size} คน · กันไว้ 15 นาทีหลังเวลานัด` : undefined
        }
      >
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {data.tables
            .filter((t) => t.status === "AVAILABLE" || t.table_id === assigning?.table_id)
            .map((table) => (
              <button
                key={table.table_id}
                type="button"
                onClick={() => {
                  if (!assigning) return;
                  void act(
                    () => holdTable(assigning.reservation_id, table.table_id),
                    `กันโต๊ะ ${table.table_no} แล้ว`,
                  ).then(() => setAssigning(null));
                }}
                className="min-h-16 rounded-xl border-2 border-line-strong bg-surface px-2 py-2 text-center transition-colors hover:border-brand-300 hover:bg-sunken"
              >
                <span className="block text-base font-bold">{table.table_no}</span>
                <span className="tabular block text-xs text-ink-faint">
                  {table.seat_capacity} ที่นั่ง
                </span>
              </button>
            ))}
        </div>
      </Overlay>

      {/* ลูกค้ามาถึง — เปิด Visit จริงผ่านขั้นตอนเช็คอินปกติ */}
      <CheckInDialog
        open={seating !== null}
        onClose={() => setSeating(null)}
        tables={data.tables}
        ticket={null}
        onDone={(result) => {
          const row = seating;
          setSeating(null);
          setQrToken(result.qr_token);
          if (row) {
            void act(() => markReservationSeated(row.reservation_id), "เปิดโต๊ะจากการจองแล้ว");
          }
        }}
      />

      <QrDialog open={qrToken !== null} onClose={() => setQrToken(null)} token={qrToken} />
    </StaffPage>
  );
}

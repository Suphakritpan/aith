import { useCallback, useState } from "react";
import { usePolling, useNow } from "../../lib/usePolling";
import { callQueue, fetchTables, fetchTodayQueue } from "../../lib/staffQueries";
import { useAuth } from "../../lib/auth";
import { useToast } from "../../design/toast";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  SectionTitle,
  Spinner,
} from "../../design/primitives";
import { IconBell, IconUsers } from "../../design/icons";
import { formatTime } from "../../lib/format";
import type { QueueTicketRow } from "../../lib/types";
import { StaffPage } from "./StaffShell";
import CheckInDialog from "./CheckInDialog";
import QrDialog from "./QrDialog";

// คิวหน้าร้าน — §04 ขั้นที่ 03-05
//
// แยกเป็นสามช่องตามขนาดกลุ่มเหมือนที่ร้านใช้จริง เพราะโต๊ะเล็กกับโต๊ะใหญ่ว่างไม่พร้อมกัน
// การเรียงรวมกันทั้งหมดจะทำให้กลุ่มเล็กที่มาทีหลังต้องรอโต๊ะใหญ่ทั้งที่โต๊ะเล็กว่างอยู่

const LANES: { id: "A" | "B" | "C"; label: string }[] = [
  { id: "A", label: "A · 1-2 คน" },
  { id: "B", label: "B · 3-4 คน" },
  { id: "C", label: "C · 5 คนขึ้นไป" },
];

export default function StaffQueuePage() {
  const { staff } = useAuth();
  const toast = useToast();
  const now = useNow(30_000);
  const [checkIn, setCheckIn] = useState<QueueTicketRow | null>(null);
  const [qr, setQr] = useState<{ token: string; tableNos?: string } | null>(null);

  const fetcher = useCallback(async () => {
    const [queue, tables] = await Promise.all([fetchTodayQueue(), fetchTables()]);
    return { queue, tables };
  }, []);

  const { data, loading, refresh } = usePolling(fetcher, 10_000);

  async function onCall(ticket: QueueTicketRow) {
    if (!staff) return;
    try {
      await callQueue(ticket.queue_ticket_id, staff.staff_id);
      toast.show(`เรียกคิว ${ticket.lane}-${ticket.seq_no} แล้ว`);
      refresh();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "เรียกคิวไม่สำเร็จ", "error");
    }
  }

  if (loading && !data) return <Spinner label="กำลังโหลดคิว" />;
  if (!data) return null;

  const availableTables = data.tables.filter((t) => t.status === "AVAILABLE").length;

  return (
    <StaffPage
      title="คิว"
      subtitle={`รออยู่ ${data.queue.length} กลุ่ม · โต๊ะว่าง ${availableTables} โต๊ะ`}
      action={
        <Button variant="outline" onClick={() => setCheckIn({} as QueueTicketRow)}>
          เปิดโต๊ะ walk-in
        </Button>
      }
    >
      {data.queue.length === 0 ? (
        <EmptyState
          icon={<IconUsers className="size-8" />}
          title="ยังไม่มีคิววันนี้"
          hint="คิวที่ลูกค้ากดรับจากหน้าเว็บจะขึ้นที่นี่โดยอัตโนมัติ"
        />
      ) : (
        <div className="space-y-6">
          {LANES.map((lane) => {
            const rows = data.queue.filter((t) => t.lane === lane.id);
            if (rows.length === 0) return null;

            return (
              <div key={lane.id}>
                <SectionTitle>
                  ช่อง {lane.label} — {rows.length} กลุ่ม
                </SectionTitle>
                <div className="space-y-2">
                  {rows.map((ticket) => {
                    const waited = Math.round(
                      (now - new Date(ticket.created_at).getTime()) / 60000,
                    );
                    const called = ticket.status === "CALLED";
                    return (
                      <Card key={ticket.queue_ticket_id} className={called ? "attention" : ""}>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-4">
                            <p className="tabular text-3xl font-bold text-brand-500">
                              {ticket.lane}-{String(ticket.seq_no).padStart(3, "0")}
                            </p>
                            <div>
                              <p className="font-semibold">{ticket.party_size} คน</p>
                              <p className="tabular text-xs text-ink-faint">
                                รับคิว {formatTime(ticket.created_at)} · รอมาแล้ว {waited} นาที
                              </p>
                              {ticket.phone ? (
                                <p className="tabular text-xs text-ink-faint">
                                  โทร {ticket.phone}
                                </p>
                              ) : null}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            {called ? <Badge tone="warn">เรียกแล้ว</Badge> : null}
                            <Button
                              variant="outline"
                              icon={<IconBell className="size-4" />}
                              onClick={() => void onCall(ticket)}
                            >
                              เรียกคิว
                            </Button>
                            <Button onClick={() => setCheckIn(ticket)}>จัดโต๊ะ</Button>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CheckInDialog
        open={checkIn !== null}
        onClose={() => setCheckIn(null)}
        tables={data.tables}
        ticket={checkIn?.queue_ticket_id ? checkIn : null}
        onDone={(result) => {
          setCheckIn(null);
          setQr({ token: result.qr_token });
          refresh();
        }}
      />

      <QrDialog
        open={qr !== null}
        onClose={() => setQr(null)}
        token={qr?.token ?? null}
        tableNos={qr?.tableNos}
      />
    </StaffPage>
  );
}

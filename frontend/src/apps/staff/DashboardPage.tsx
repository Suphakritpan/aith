import { useCallback } from "react";
import { Link } from "react-router";
import { usePolling, useNow } from "../../lib/usePolling";
import {
  fetchActiveVisits,
  fetchOpenServiceCalls,
  fetchTables,
  fetchTodayQueue,
  acceptServiceCall,
  finishServiceCall,
} from "../../lib/staffQueries";
import { useAuth } from "../../lib/auth";
import { useToast } from "../../design/toast";
import { SERVICE_CALL_LABEL, VISIT_STATUS_LABEL } from "../../lib/types";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  SectionTitle,
  Spinner,
  Stat,
  TimeBar,
} from "../../design/primitives";
import { IconAlert, IconBell, IconCheck, IconChevronRight } from "../../design/icons";
import { elapsedMinutesSince, formatClock, formatTime } from "../../lib/format";
import { StaffPage } from "./StaffShell";

// แดชบอร์ด — หน้าที่พนักงานเปิดค้างไว้ทั้งกะ
//
// ลำดับบนหน้าจอเรียงตามความเร่งด่วน ไม่ได้เรียงตามความสำคัญของข้อมูล
// สิ่งที่ต้องลงมือทำตอนนี้อยู่บนสุด (คำเรียก โต๊ะเกินเวลา ขอเช็กบิล)
// ส่วนภาพรวมที่ดูไว้เฉย ๆ อยู่ล่างลงไป

export default function DashboardPage() {
  const { staff } = useAuth();
  const toast = useToast();
  const now = useNow(30_000);

  const fetcher = useCallback(async () => {
    const [visits, queue, calls, tables] = await Promise.all([
      fetchActiveVisits(),
      fetchTodayQueue(),
      fetchOpenServiceCalls(),
      fetchTables(),
    ]);
    return { visits, queue, calls, tables };
  }, []);

  const { data, loading, error, refresh } = usePolling(fetcher, 10_000);

  if (loading && !data) return <Spinner label="กำลังโหลดแดชบอร์ด" />;
  if (error && !data) {
    return (
      <StaffPage title="แดชบอร์ด">
        <EmptyState title="โหลดข้อมูลไม่สำเร็จ" hint={error.message} />
      </StaffPage>
    );
  }
  if (!data) return null;

  const { visits, queue, calls, tables } = data;

  const overtime = visits.filter(
    (v) => elapsedMinutesSince(v.seated_at, now) > v.duration_minutes,
  );
  const billRequested = visits.filter((v) => v.status === "BILL_REQUESTED");
  const occupied = tables.filter((t) => t.status === "OCCUPIED").length;
  const cleaning = tables.filter((t) => t.status === "CLEANING").length;

  async function onAccept(callId: string) {
    if (!staff) return;
    try {
      await acceptServiceCall(callId, staff.staff_id);
      toast.show("รับงานแล้ว");
      refresh();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "รับงานไม่สำเร็จ", "error");
    }
  }

  async function onFinish(callId: string) {
    try {
      await finishServiceCall(callId);
      toast.show("ปิดงานแล้ว");
      refresh();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "ปิดงานไม่สำเร็จ", "error");
    }
  }

  return (
    <StaffPage
      title="แดชบอร์ด"
      subtitle={`อัปเดตอัตโนมัติทุก 10 วินาที · ${new Date().toLocaleDateString("th-TH", { dateStyle: "long" })}`}
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="โต๊ะที่มีลูกค้า"
          value={occupied}
          unit={`/ ${tables.length}`}
          hint={cleaning > 0 ? `รอเก็บอีก ${cleaning} โต๊ะ` : undefined}
        />
        <Stat label="คิวที่รออยู่" value={queue.length} unit="กลุ่ม" />
        <Stat
          label="คำเรียกค้าง"
          value={calls.length}
          unit="รายการ"
          tone={calls.length > 0 ? "warn" : "neutral"}
        />
        <Stat
          label="โต๊ะเกินเวลา"
          value={overtime.length}
          unit="โต๊ะ"
          tone={overtime.length > 0 ? "brand" : "neutral"}
        />
      </div>

      {/* งานที่ต้องลงมือตอนนี้ */}
      {calls.length > 0 ? (
        <div className="mt-6">
          <SectionTitle>คำเรียกจากโต๊ะ</SectionTitle>
          <div className="space-y-2">
            {calls.map((call) => {
              const visit = visits.find((v) => v.visit_id === call.visit_id);
              const waited = Math.round(
                (now - new Date(call.created_at).getTime()) / 60000,
              );
              return (
                <Card
                  key={call.service_call_id}
                  className={call.status === "OPEN" ? "attention" : ""}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="text-brand-500">
                        <IconBell />
                      </span>
                      <div>
                        <p className="font-bold">
                          โต๊ะ {visit?.table_nos ?? "—"} ·{" "}
                          {SERVICE_CALL_LABEL[call.type]}
                        </p>
                        <p className="tabular text-xs text-ink-faint">
                          เรียกเมื่อ {formatTime(call.created_at)} · รอมาแล้ว {waited} นาที
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {call.status === "OPEN" ? (
                        <Button size="sm" onClick={() => void onAccept(call.service_call_id)}>
                          รับงาน
                        </Button>
                      ) : (
                        <Badge tone="info">กำลังทำ</Badge>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        icon={<IconCheck className="size-4" />}
                        onClick={() => void onFinish(call.service_call_id)}
                      >
                        เสร็จแล้ว
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      ) : null}

      {billRequested.length > 0 ? (
        <div className="mt-6">
          <SectionTitle>รอเก็บเงิน</SectionTitle>
          <div className="grid gap-2 sm:grid-cols-2">
            {billRequested.map((visit) => (
              <Link key={visit.visit_id} to={`/staff/visit/${visit.visit_id}`}>
                <Card className="transition-colors hover:border-brand-300">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-bold">โต๊ะ {visit.table_nos ?? "—"}</p>
                      <p className="text-xs text-ink-faint">
                        {visit.paying_pax} คน · ขอเช็กบิลแล้ว
                      </p>
                    </div>
                    <span className="text-ink-faint">
                      <IconChevronRight />
                    </span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {/* ภาพรวมโต๊ะที่กำลังใช้งาน */}
      <div className="mt-6">
        <SectionTitle
          action={
            <Link to="/staff/floor" className="text-sm font-semibold text-brand-600">
              ไปผังโต๊ะ
            </Link>
          }
        >
          โต๊ะที่กำลังใช้งาน ({visits.length})
        </SectionTitle>

        {visits.length === 0 ? (
          <EmptyState
            title="ยังไม่มีโต๊ะที่เปิดอยู่"
            hint="เมื่อเช็คอินลูกค้าเข้าโต๊ะ รายการจะขึ้นที่นี่พร้อมเวลานับถอยหลัง"
          />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {visits.map((visit) => {
              const elapsed = elapsedMinutesSince(visit.seated_at, now);
              const over = elapsed > visit.duration_minutes;
              const near = !over && visit.duration_minutes - elapsed <= 15;
              return (
                <Link key={visit.visit_id} to={`/staff/visit/${visit.visit_id}`}>
                  <Card className="h-full transition-colors hover:border-brand-300">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-lg font-bold">โต๊ะ {visit.table_nos ?? "—"}</p>
                        <p className="text-xs text-ink-faint">
                          {visit.paying_pax} คน
                          {visit.lane ? ` · คิว ${visit.lane}-${visit.seq_no}` : ""}
                        </p>
                      </div>
                      <Badge
                        tone={
                          visit.status === "BILL_REQUESTED"
                            ? "info"
                            : over
                              ? "brand"
                              : near
                                ? "warn"
                                : "ok"
                        }
                      >
                        {VISIT_STATUS_LABEL[visit.status]}
                      </Badge>
                    </div>

                    <div className="mt-3">
                      <TimeBar elapsed={elapsed} duration={visit.duration_minutes} />
                      <p
                        className={`tabular mt-1.5 text-sm font-semibold ${
                          over ? "text-brand-600" : near ? "text-warn-500" : "text-ink-soft"
                        }`}
                      >
                        {over
                          ? `เกินมา ${formatClock(elapsed - visit.duration_minutes)}`
                          : `เหลือ ${formatClock(visit.duration_minutes - elapsed)}`}
                      </p>
                    </div>

                    {(visit.open_item_count > 0 || visit.open_call_count > 0) && (
                      <div className="mt-2 flex gap-2 text-xs text-ink-faint">
                        {visit.open_item_count > 0 ? (
                          <span>ครัวค้าง {visit.open_item_count}</span>
                        ) : null}
                        {visit.open_call_count > 0 ? (
                          <span className="flex items-center gap-1 text-warn-500">
                            <IconAlert className="size-3.5" />
                            เรียก {visit.open_call_count}
                          </span>
                        ) : null}
                      </div>
                    )}
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </StaffPage>
  );
}

import { useCallback, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { usePolling, useNow } from "../../lib/usePolling";
import {
  addPax,
  closeVisit,
  fetchVisitDetail,
  issueBill,
  recordPayment,
  voidVisit,
} from "../../lib/staffQueries";
import { useAuth } from "../../lib/auth";
import { useToast } from "../../design/toast";
import { ConfirmDialog, Overlay } from "../../design/overlay";
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  Notice,
  SectionTitle,
  Select,
  Spinner,
  Stepper,
  TimeBar,
} from "../../design/primitives";
import { IconAlert, IconChevronLeft } from "../../design/icons";
import {
  ORDER_STATUS_LABEL,
  TIER_LABEL,
  VISIT_STATUS_LABEL,
  type OrderItemStatus,
  type PaxTier,
} from "../../lib/types";
import { elapsedMinutesSince, formatBaht, formatClock, formatTime } from "../../lib/format";
import { StaffPage } from "./StaffShell";
import MergeBillDialog from "./MergeBillDialog";

// รายละเอียด Visit — ศูนย์กลางของทุกอย่างที่เกิดขึ้นบนโต๊ะหนึ่งโต๊ะ
//
// เรียงจากสิ่งที่พนักงานต้องตัดสินใจบ่อยที่สุดลงไป: เวลา → เงิน → ออเดอร์ → คนและโต๊ะ
// ปุ่มที่ย้อนยาก (ปิดโต๊ะ ยกเลิก) อยู่ล่างสุดและมีกล่องยืนยันเสมอ

export default function VisitPage() {
  const { visitId = "" } = useParams();
  const navigate = useNavigate();
  const { staff, atLeast } = useAuth();
  const toast = useToast();
  const now = useNow(10_000);

  const [payOpen, setPayOpen] = useState(false);
  const [paxOpen, setPaxOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const fetcher = useCallback(() => fetchVisitDetail(visitId), [visitId]);
  const { data, loading, refresh } = usePolling(fetcher, 8000, Boolean(visitId));

  if (loading && !data) return <Spinner label="กำลังโหลดข้อมูลโต๊ะ" />;
  if (!data?.live) {
    return (
      <StaffPage title="ไม่พบโต๊ะนี้">
        <Notice tone="warn">Visit นี้อาจถูกปิดหรือยกเลิกไปแล้ว</Notice>
      </StaffPage>
    );
  }

  const { live, pax, addons, batches, bill, payments, calls } = data;
  const elapsed = elapsedMinutesSince(live.seated_at, now);
  const over = elapsed > live.duration_minutes;
  const paidTotal = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const outstanding = bill ? Number(bill.net_total) - paidTotal : 0;
  const closed = live.status === "CLOSED" || live.status === "VOIDED";

  async function run(action: () => Promise<void>, successMessage: string) {
    setBusy(true);
    try {
      await action();
      toast.show(successMessage);
      refresh();
      return true;
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "ทำรายการไม่สำเร็จ", "error");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <StaffPage
      title={`โต๊ะ ${live.table_nos ?? "—"}`}
      subtitle={`${live.paying_pax} คนที่จ่ายเงิน${live.lane ? ` · คิว ${live.lane}-${live.seq_no}` : ""}`}
      action={
        <Button variant="ghost" icon={<IconChevronLeft />} onClick={() => navigate(-1)}>
          ย้อนกลับ
        </Button>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-4">
          {/* เวลา */}
          <Card>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-ink-faint">สถานะ</p>
                <p className="text-xl font-bold">{VISIT_STATUS_LABEL[live.status]}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-ink-faint">
                  {over ? "เกินเวลามาแล้ว" : "เหลือเวลา"}
                </p>
                <p
                  className={`tabular text-xl font-bold ${over ? "text-brand-600" : "text-ink"}`}
                >
                  {over
                    ? formatClock(elapsed - live.duration_minutes)
                    : formatClock(live.duration_minutes - elapsed)}
                </p>
              </div>
            </div>
            <TimeBar elapsed={elapsed} duration={live.duration_minutes} className="mt-3" />
            <p className="tabular mt-2 text-xs text-ink-faint">
              เริ่ม {formatTime(live.seated_at)} · แพ็กเกจ {live.duration_minutes} นาที
            </p>

            {over ? (
              <Notice tone="brand" icon={<IconAlert className="size-4" />}>
                เกินเวลาแล้ว ระบบคิดค่าบุฟเฟต์เพิ่มเต็มรอบตามจำนวนคนที่จ่ายเงิน
              </Notice>
            ) : null}
          </Card>

          {/* เงิน */}
          <Card>
            <SectionTitle>เงิน</SectionTitle>
            {bill ? (
              <>
                <dl className="divide-y divide-line">
                  <div className="flex justify-between py-1.5 text-sm">
                    <dt className="text-ink-soft">ค่าแพ็กเกจ</dt>
                    <dd className="tabular">{formatBaht(bill.package_subtotal)} ฿</dd>
                  </div>
                  {Number(bill.addon_subtotal) > 0 ? (
                    <div className="flex justify-between py-1.5 text-sm">
                      <dt className="text-ink-soft">รายการเสริม</dt>
                      <dd className="tabular">{formatBaht(bill.addon_subtotal)} ฿</dd>
                    </div>
                  ) : null}
                  {bill.overtime_rounds > 0 ? (
                    <div className="flex justify-between py-1.5 text-sm">
                      <dt className="text-ink-soft">
                        เกินเวลา {bill.overtime_rounds} รอบ
                      </dt>
                      <dd className="tabular">{formatBaht(bill.overtime_subtotal)} ฿</dd>
                    </div>
                  ) : null}
                  <div className="flex justify-between py-2 text-lg font-bold">
                    <dt>ยอดสุทธิ</dt>
                    <dd className="tabular">{formatBaht(bill.net_total)} ฿</dd>
                  </div>
                  <div className="flex justify-between py-1.5 text-sm">
                    <dt className="text-ink-soft">รับแล้ว</dt>
                    <dd className="tabular">{formatBaht(paidTotal)} ฿</dd>
                  </div>
                  <div
                    className={`flex justify-between py-2 font-bold ${outstanding > 0 ? "text-brand-600" : "text-ok-500"}`}
                  >
                    <dt>{outstanding > 0 ? "ยอดค้าง" : "ชำระครบแล้ว"}</dt>
                    <dd className="tabular">{formatBaht(outstanding)} ฿</dd>
                  </div>
                </dl>

                {payments.length > 0 ? (
                  <ul className="mt-2 space-y-1 border-t border-line pt-2 text-xs text-ink-faint">
                    {payments.map((p) => (
                      <li key={p.payment_id} className="tabular flex justify-between">
                        <span>
                          {p.method} · {formatTime(p.paid_at)}
                        </span>
                        <span>{formatBaht(p.amount)} ฿</span>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {!closed && outstanding > 0 ? (
                  <Button block className="mt-3" onClick={() => setPayOpen(true)}>
                    รับเงิน
                  </Button>
                ) : null}
              </>
            ) : (
              <>
                <p className="text-sm text-ink-faint">
                  ยังไม่ได้ออกบิล กดขอเช็กบิลเพื่อล็อกการสั่งและคิดยอด
                </p>
                <Button
                  block
                  className="mt-3"
                  disabled={busy || closed}
                  onClick={() =>
                    void run(async () => {
                      await issueBill(visitId);
                    }, "ออกบิลแล้ว")
                  }
                >
                  ขอเช็กบิล
                </Button>
              </>
            )}
          </Card>

          {/* คนและรายการเสริม */}
          <Card>
            <SectionTitle
              action={
                !closed ? (
                  <button
                    className="text-sm font-semibold text-brand-600"
                    onClick={() => setPaxOpen(true)}
                  >
                    เพิ่มคน
                  </button>
                ) : undefined
              }
            >
              จำนวนคน
            </SectionTitle>
            <ul className="divide-y divide-line">
              {pax.map((p) => (
                <li key={p.tier} className="flex justify-between py-1.5 text-sm">
                  <span>{TIER_LABEL[p.tier as PaxTier]}</span>
                  <span className="tabular">
                    {p.qty} คน × {formatBaht(p.unit_price)} ฿
                  </span>
                </li>
              ))}
              {addons.map((a) => (
                <li key={a.addon_id} className="flex justify-between py-1.5 text-sm">
                  <span>{a.addon?.name ?? "รายการเสริม"}</span>
                  <span className="tabular">
                    {a.qty} ที่ × {formatBaht(a.unit_price)} ฿
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-ink-faint">
              เพิ่มคนได้ตลอดมื้อ แต่ลดไม่ได้ — ถ้าระบุผิดต้องให้หัวหน้ากะยกเลิกทั้ง Visit
            </p>
          </Card>
        </div>

        <div className="space-y-4">
          {/* ออเดอร์ */}
          <Card>
            <SectionTitle>ออเดอร์ ({batches.length} รอบ)</SectionTitle>
            {batches.length === 0 ? (
              <p className="py-4 text-center text-sm text-ink-faint">ยังไม่มีออเดอร์</p>
            ) : (
              <div className="space-y-3">
                {batches.map((batch, index) => (
                  <div key={batch.order_batch_id}>
                    <p className="tabular mb-1 text-xs font-semibold text-ink-faint">
                      รอบที่ {batches.length - index} · {formatTime(batch.created_at)} ·{" "}
                      {batch.source === "STAFF" ? "พนักงานสั่งแทน" : "ลูกค้าสั่งเอง"}
                    </p>
                    <ul className="divide-y divide-line">
                      {batch.order_item.map((item) => (
                        <li
                          key={item.order_item_id}
                          className="flex items-center justify-between gap-2 py-1.5 text-sm"
                        >
                          <span>
                            {item.menu_item?.name ?? "รายการอาหาร"}
                            <span className="tabular ml-1.5 text-ink-faint">
                              ×{item.qty}
                            </span>
                          </span>
                          <Badge
                            tone={
                              item.status === "SERVED"
                                ? "ok"
                                : item.status === "PREPARING"
                                  ? "warn"
                                  : item.status === "CANCELLED"
                                    ? "neutral"
                                    : "info"
                            }
                          >
                            {ORDER_STATUS_LABEL[item.status as OrderItemStatus] ??
                              item.status}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* คำเรียก */}
          {calls.length > 0 ? (
            <Card>
              <SectionTitle>ประวัติการเรียก</SectionTitle>
              <ul className="divide-y divide-line text-sm">
                {calls.slice(0, 6).map((call) => (
                  <li key={call.service_call_id} className="flex justify-between py-1.5">
                    <span>{call.type}</span>
                    <span className="tabular text-ink-faint">
                      {formatTime(call.created_at)} · {call.status}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {/* การกระทำที่ย้อนยาก */}
          {!closed ? (
            <Card>
              <SectionTitle>ปิดงาน</SectionTitle>
              <div className="space-y-2">
                <Button
                  block
                  variant="outline"
                  disabled={!bill || outstanding > 0}
                  onClick={() => setCloseOpen(true)}
                >
                  ปิดโต๊ะ
                </Button>
                {!bill || outstanding > 0 ? (
                  <p className="text-xs text-ink-faint">
                    ปิดได้เมื่อออกบิลและรับเงินครบแล้วเท่านั้น
                  </p>
                ) : null}

                {atLeast("SUPERVISOR") ? (
                  <>
                    <Button block variant="outline" onClick={() => setMergeOpen(true)}>
                      รวมบิลกับโต๊ะอื่น
                    </Button>
                    <Button block variant="danger" onClick={() => setVoidOpen(true)}>
                      ยกเลิก Visit
                    </Button>
                  </>
                ) : null}
              </div>
            </Card>
          ) : (
            <Notice tone="neutral">
              Visit นี้ {VISIT_STATUS_LABEL[live.status]} แล้ว แก้ไขอะไรไม่ได้
            </Notice>
          )}
        </div>
      </div>

      <PaymentDialog
        open={payOpen}
        onClose={() => setPayOpen(false)}
        outstanding={outstanding}
        payingPax={live.paying_pax}
        busy={busy}
        onSubmit={async (method, amount) => {
          if (!bill || !staff) return;
          const ok = await run(
            () =>
              recordPayment({
                billId: bill.bill_id,
                method,
                amount,
                staffId: staff.staff_id,
              }),
            "บันทึกการรับเงินแล้ว",
          );
          if (ok) setPayOpen(false);
        }}
      />

      <AddPaxDialog
        open={paxOpen}
        onClose={() => setPaxOpen(false)}
        busy={busy}
        onSubmit={async (tier, qty) => {
          if (!staff) return;
          const ok = await run(
            () => addPax(visitId, tier, qty, staff.staff_id),
            "เพิ่มจำนวนคนแล้ว",
          );
          if (ok) setPaxOpen(false);
        }}
      />

      <ConfirmDialog
        open={closeOpen}
        onClose={() => setCloseOpen(false)}
        busy={busy}
        title="ปิดโต๊ะ"
        message="ปิดแล้ว QR ของลูกค้าจะหมดอายุทันทีและโต๊ะจะเข้าสถานะรอเก็บ ย้อนกลับไม่ได้"
        confirmLabel="ปิดโต๊ะ"
        onConfirm={() =>
          void run(() => closeVisit(visitId), "ปิดโต๊ะแล้ว").then((ok) => {
            if (ok) {
              setCloseOpen(false);
              navigate("/staff/floor");
            }
          })
        }
      />

      <MergeBillDialog
        open={mergeOpen}
        onClose={() => setMergeOpen(false)}
        visitId={visitId}
        onDone={refresh}
      />

      <VoidDialog
        open={voidOpen}
        onClose={() => setVoidOpen(false)}
        busy={busy}
        onSubmit={async (reason) => {
          const ok = await run(() => voidVisit(visitId, reason), "ยกเลิก Visit แล้ว");
          if (ok) {
            setVoidOpen(false);
            navigate("/staff/floor");
          }
        }}
      />
    </StaffPage>
  );
}

/* ── กล่องย่อย ────────────────────────────────────────────────────────────── */

function PaymentDialog({
  open,
  onClose,
  outstanding,
  payingPax,
  busy,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  outstanding: number;
  payingPax: number;
  busy: boolean;
  onSubmit: (method: "CASH" | "PROMPTPAY" | "TRANSFER", amount: number) => void;
}) {
  const [method, setMethod] = useState<"CASH" | "PROMPTPAY" | "TRANSFER">("CASH");
  const [amount, setAmount] = useState(String(outstanding));

  // ยอดต่อหัวคำนวณให้เลย เพราะการหารกันในโต๊ะเป็นเรื่องที่ลูกค้าถามแทบทุกครั้ง
  const perHead = payingPax > 0 ? Math.ceil(outstanding / payingPax) : 0;

  return (
    <Overlay
      open={open}
      onClose={onClose}
      title="รับเงิน"
      description={`ยอดค้าง ${formatBaht(outstanding)} บาท`}
      footer={
        <Button
          block
          size="lg"
          disabled={busy || !(Number(amount) > 0)}
          onClick={() => onSubmit(method, Number(amount))}
        >
          {busy ? "กำลังบันทึก…" : `บันทึกรับ ${formatBaht(Number(amount) || 0)} ฿`}
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="วิธีชำระ" htmlFor="method">
          <Select
            id="method"
            value={method}
            onChange={(e) => setMethod(e.target.value as typeof method)}
          >
            <option value="CASH">เงินสด</option>
            <option value="PROMPTPAY">PromptPay</option>
            <option value="TRANSFER">โอน</option>
          </Select>
        </Field>

        <Field
          label="จำนวนเงิน"
          htmlFor="amount"
          hint="รับเป็นก้อนหรือแยกหลายครั้งก็ได้ ระบบจะปิดโต๊ะให้เมื่อรับครบยอด"
        >
          <Input
            id="amount"
            type="number"
            inputMode="decimal"
            min={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setAmount(String(outstanding))}>
            เต็มยอด {formatBaht(outstanding)}
          </Button>
          {payingPax > 1 ? (
            <Button variant="outline" size="sm" onClick={() => setAmount(String(perHead))}>
              หารตามหัว {formatBaht(perHead)} × {payingPax}
            </Button>
          ) : null}
        </div>
      </div>
    </Overlay>
  );
}

function AddPaxDialog({
  open,
  onClose,
  busy,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  busy: boolean;
  onSubmit: (tier: PaxTier, qty: number) => void;
}) {
  const [tier, setTier] = useState<PaxTier>("ADULT");
  const [qty, setQty] = useState(1);

  return (
    <Overlay
      open={open}
      onClose={onClose}
      title="เพิ่มจำนวนคน"
      description="เพิ่มได้ตลอดมื้อ แต่ลดไม่ได้"
      footer={
        <Button block size="lg" disabled={busy} onClick={() => onSubmit(tier, qty)}>
          {busy ? "กำลังบันทึก…" : `เพิ่ม ${qty} คน`}
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="ช่วงราคา" htmlFor="tier">
          <Select
            id="tier"
            value={tier}
            onChange={(e) => setTier(e.target.value as PaxTier)}
          >
            <option value="ADULT">ผู้ใหญ่</option>
            <option value="CHILD">เด็ก</option>
            <option value="TODDLER_FREE">เด็กเล็ก (ฟรี)</option>
          </Select>
        </Field>

        <div className="flex items-center justify-between">
          <span className="font-semibold">จำนวน</span>
          <Stepper value={qty} onChange={setQty} min={1} max={20} label="จำนวนคน" />
        </div>
      </div>
    </Overlay>
  );
}

function VoidDialog({
  open,
  onClose,
  busy,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  busy: boolean;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const tooShort = reason.trim().length < 10;

  return (
    <Overlay
      open={open}
      onClose={onClose}
      title="ยกเลิก Visit"
      description="ใช้เมื่อเปิดโต๊ะผิดหรือลูกค้าไม่อยู่แล้ว"
      footer={
        <Button
          block
          size="lg"
          variant="danger"
          disabled={busy || tooShort}
          onClick={() => onSubmit(reason.trim())}
        >
          {busy ? "กำลังยกเลิก…" : "ยืนยันยกเลิก"}
        </Button>
      }
    >
      <Field
        label="เหตุผล"
        htmlFor="reason"
        hint="ต้องอย่างน้อย 10 ตัวอักษร เพราะจะถูกบันทึกลง audit log ถาวร"
        error={reason.length > 0 && tooShort ? "เหตุผลสั้นเกินไป" : null}
      >
        <Input
          id="reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="เช่น เปิดโต๊ะผิด ลูกค้าย้ายไปโต๊ะอื่น"
        />
      </Field>
    </Overlay>
  );
}

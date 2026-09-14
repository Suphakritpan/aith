import { useMemo, useState } from "react";
import { Overlay } from "../../design/overlay";
import { Button, Notice, Stepper } from "../../design/primitives";
import { IconAlert } from "../../design/icons";
import { useToast } from "../../design/toast";
import { openVisit } from "../../lib/staffQueries";
import type { DiningTable, QueueTicketRow } from "../../lib/types";

// เช็คอิน — §04 ขั้นที่ 04-05
//
// ขั้นตอนเดียวจบ: เลือกโต๊ะ ระบุจำนวนคนแยกช่วงราคา แล้วกดเปิด
// ไม่แยกเป็นวิซาร์ดหลายหน้าเพราะพนักงานทำซ้ำวันละหลายสิบครั้ง การเห็นทุกอย่างพร้อมกัน
// แล้วแก้จุดที่ผิดได้ทันทีเร็วกว่าการเดินหน้า-ถอยหลังทีละขั้น
//
// จุดที่ต้องระวังคือ "เด็กเล็กฟรี" ซึ่งฐานข้อมูลบังคับให้ต้องมีพนักงานยืนยันส่วนสูง
// หน้าจอจึงเขียนเงื่อนไขไว้ตรงนั้นเลย ไม่ใช่ให้ไปรู้ตอนกดแล้วโดนปฏิเสธ

export default function CheckInDialog({
  open,
  onClose,
  onDone,
  tables,
  ticket,
}: {
  open: boolean;
  onClose: () => void;
  onDone: (result: { visit_id: string; qr_token: string }) => void;
  tables: DiningTable[];
  ticket: QueueTicketRow | null;
}) {
  const toast = useToast();
  const [selected, setSelected] = useState<string[]>([]);
  const [adult, setAdult] = useState(ticket?.party_size ?? 2);
  const [child, setChild] = useState(0);
  const [toddler, setToddler] = useState(0);
  const [addonQty, setAddonQty] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const available = useMemo(
    () => tables.filter((t) => t.status === "AVAILABLE"),
    [tables],
  );

  const seats = useMemo(
    () =>
      selected.reduce(
        (sum, id) => sum + (tables.find((t) => t.table_id === id)?.seat_capacity ?? 0),
        0,
      ),
    [selected, tables],
  );

  const heads = adult + child + toddler;
  const notEnoughSeats = selected.length > 0 && heads > seats;

  function toggle(tableId: string) {
    setSelected((prev) =>
      prev.includes(tableId) ? prev.filter((id) => id !== tableId) : [...prev, tableId],
    );
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const result = await openVisit({
        queueTicketId: ticket?.queue_ticket_id ?? null,
        tableIds: selected,
        adult,
        child,
        toddlerFree: toddler,
        addonQty,
      });
      toast.show(`เปิดโต๊ะแล้ว · ${heads} คน`);
      onDone(result);
      // ล้างค่าให้พร้อมสำหรับกลุ่มถัดไป
      setSelected([]);
      setChild(0);
      setToddler(0);
      setAddonQty(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "เปิดโต๊ะไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Overlay
      open={open}
      onClose={onClose}
      size="lg"
      title={ticket ? `เช็คอินคิว ${ticket.lane}-${String(ticket.seq_no).padStart(3, "0")}` : "เปิดโต๊ะ (ลูกค้า walk-in)"}
      description={ticket ? `แจ้งมา ${ticket.party_size} คน` : "ไม่ได้มาจากคิว"}
      footer={
        <Button
          size="lg"
          block
          disabled={busy || selected.length === 0 || heads < 1}
          onClick={() => void submit()}
        >
          {busy ? "กำลังเปิดโต๊ะ…" : `เปิดโต๊ะ · ${heads} คน`}
        </Button>
      }
    >
      <div className="space-y-5">
        {error ? (
          <Notice tone="brand" icon={<IconAlert className="size-4" />}>
            {error}
          </Notice>
        ) : null}

        <div>
          <p className="text-sm font-semibold">เลือกโต๊ะ</p>
          <p className="mt-0.5 text-xs text-ink-faint">
            เลือกได้หลายโต๊ะสำหรับกลุ่มใหญ่ ทุกโต๊ะจะอยู่ใน Visit เดียวกัน
            ใช้นาฬิกาและบิลร่วมกัน
          </p>

          {available.length === 0 ? (
            <p className="mt-3 rounded-xl bg-sunken px-3 py-4 text-center text-sm text-ink-faint">
              ตอนนี้ไม่มีโต๊ะว่าง
            </p>
          ) : (
            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {available.map((table) => {
                const on = selected.includes(table.table_id);
                return (
                  <button
                    key={table.table_id}
                    type="button"
                    onClick={() => toggle(table.table_id)}
                    aria-pressed={on}
                    className={`min-h-16 rounded-xl border-2 px-2 py-2 text-center transition-colors ${
                      on
                        ? "border-brand-500 bg-brand-500 text-white"
                        : "border-line-strong bg-surface hover:bg-sunken"
                    }`}
                  >
                    <span className="block text-base font-bold">{table.table_no}</span>
                    <span
                      className={`tabular block text-xs ${on ? "text-brand-100" : "text-ink-faint"}`}
                    >
                      {table.seat_capacity} ที่นั่ง
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {selected.length > 0 ? (
            <p
              className={`tabular mt-2 text-sm font-semibold ${notEnoughSeats ? "text-warn-500" : "text-ink-soft"}`}
            >
              รวม {seats} ที่นั่ง สำหรับ {heads} คน
              {notEnoughSeats ? " — ที่นั่งไม่พอ ต้องให้หัวหน้ากะอนุมัติ" : ""}
            </p>
          ) : null}
        </div>

        <div className="space-y-3 border-t border-line pt-4">
          <p className="text-sm font-semibold">จำนวนคน</p>

          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold">ผู้ใหญ่</p>
              <p className="tabular text-xs text-ink-faint">289 บาท/คน</p>
            </div>
            <Stepper value={adult} onChange={setAdult} label="ผู้ใหญ่" max={30} />
          </div>

          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold">เด็ก</p>
              <p className="tabular text-xs text-ink-faint">189 บาท/คน</p>
            </div>
            <Stepper value={child} onChange={setChild} label="เด็ก" max={30} />
          </div>

          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold">เด็กเล็ก (ฟรี)</p>
              <p className="text-xs text-ink-faint">
                สูงไม่เกิน 90 ซม. — กดแล้วถือว่าคุณยืนยันส่วนสูงแล้ว
              </p>
            </div>
            <Stepper value={toddler} onChange={setToddler} label="เด็กเล็ก" max={10} />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
          <div>
            <p className="font-semibold">น้ำดื่มรีฟิล</p>
            <p className="tabular text-xs text-ink-faint">
              39 บาท/คน · ลูกค้าเพิ่มเองทีหลังได้จากหน้าโต๊ะ
            </p>
          </div>
          <Stepper
            value={addonQty}
            onChange={setAddonQty}
            label="น้ำรีฟิล"
            max={adult + child}
          />
        </div>
      </div>
    </Overlay>
  );
}

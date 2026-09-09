import { useState } from "react";
import { api, ApiError, newIdempotencyKey } from "../../lib/api";
import type { Bill, BillEstimate, VisitView } from "../../lib/types";
import { TIER_LABEL } from "../../lib/types";
import { Button, Card, Notice } from "../../components/ui";
import { formatBaht } from "../../lib/format";

// §10 เครื่องคิดเงิน — ยอดมาจากสามองค์ประกอบเท่านั้น
// ค่าแพ็กเกจตามหัว + add-on + ค่าเกินเวลา ไม่มีราคาต่อจาน
//
// ก่อนขอเช็กบิลจะแสดง "ยอดประมาณการ" ที่คำนวณสด หลังขอแล้วจะแสดงบิลที่ snapshot ไว้
// สองค่านี้ต่างกันได้ถ้าเวลาเดินต่อ จึงต้องบอกให้ชัดว่ากำลังดูอันไหน

type Props = {
  token: string;
  visit: VisitView["visit"];
  pax: VisitView["pax"];
  addons: VisitView["addons"];
  estimate: BillEstimate;
  bill: Bill | null;
  onDone: () => void;
};

function Row({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-3 py-1.5 ${
        strong ? "text-lg font-bold" : "text-[15px]"
      }`}
    >
      <span className={strong ? "" : "text-muted-strong"}>{label}</span>
      <span className="tabular">{value}</span>
    </div>
  );
}

export default function BillTab({ token, visit, pax, addons, estimate, bill, onDone }: Props) {
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const source = bill ?? estimate;
  const issued = bill !== null;
  const payingPax = visit.paying_pax;
  const perHead = payingPax > 0 ? Math.ceil(source.net_total / payingPax) : null;

  async function requestBill() {
    setAsking(true);
    setError(null);
    try {
      await api.requestBill(token, newIdempotencyKey());
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "ขอเช็กบิลไม่สำเร็จ");
    } finally {
      setAsking(false);
    }
  }

  return (
    <>
      {error ? <Notice tone="error">{error}</Notice> : null}

      <Card>
        <p className="text-sm font-semibold">
          {issued ? "บิลของคุณ" : "ยอดปัจจุบัน (ประมาณการ)"}
        </p>
        {!issued ? (
          <p className="mt-1 text-xs text-muted">
            ยอดนี้เปลี่ยนได้ถ้าสั่งเพิ่มหรือเลยเวลา จะนิ่งเมื่อกดขอเช็กบิล
          </p>
        ) : null}

        <div className="mt-3 divide-y divide-divider">
          {pax.map((p) => (
            <Row
              key={p.tier}
              label={`${TIER_LABEL[p.tier]} ${p.qty} คน × ${formatBaht(p.unit_price)}`}
              value={`${formatBaht(p.qty * p.unit_price)} ฿`}
            />
          ))}

          {addons.length > 0
            ? addons.map((a) => (
                <Row
                  key={a.addon_id}
                  label={`${a.name ?? "รายการเสริม"} ${a.qty} ที่ × ${formatBaht(a.unit_price)}`}
                  value={`${formatBaht(a.qty * a.unit_price)} ฿`}
                />
              ))
            : null}

          {source.overtime_rounds > 0 ? (
            <Row
              label={`เกินเวลา ${source.overtime_rounds} รอบ`}
              value={`${formatBaht(source.overtime_subtotal)} ฿`}
            />
          ) : null}

          {issued && bill.discount_amount > 0 ? (
            <Row label="ส่วนลด" value={`−${formatBaht(bill.discount_amount)} ฿`} />
          ) : null}

          <Row label="ยอดสุทธิ" value={`${formatBaht(source.net_total)} ฿`} strong />
        </div>
      </Card>

      {perHead !== null ? (
        <Card>
          <p className="text-sm font-semibold">หารเท่ากันตามหัว</p>
          <p className="mt-1 text-xs text-muted">
            คิดจาก {payingPax} คนที่จ่ายเงิน (เด็กเล็กที่ได้ฟรีไม่นับ) · เศษบาทตกที่คนแรก
          </p>
          <p className="tabular mt-2 text-3xl font-bold text-brand-500">
            {formatBaht(perHead)} ฿ <span className="text-base font-medium">/ คน</span>
          </p>
        </Card>
      ) : null}

      {source.overtime_rounds > 0 ? (
        <Notice tone="warn">
          เลยเวลา {visit.duration_minutes} นาที ระบบคิดค่าบุฟเฟต์เพิ่มอีก{" "}
          {source.overtime_rounds} รอบเต็มตามเงื่อนไขของร้าน
        </Notice>
      ) : null}

      {!issued ? (
        <Button size="lg" onClick={requestBill} disabled={asking}>
          {asking ? "กำลังขอเช็กบิล…" : "ขอเช็กบิล"}
        </Button>
      ) : (
        <Notice tone="info">
          ขอเช็กบิลแล้ว พนักงานกำลังไปที่โต๊ะ — ชำระที่โต๊ะได้ทั้งเงินสด โอน และ PromptPay
        </Notice>
      )}
    </>
  );
}

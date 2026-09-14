import { useCallback, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { api, ApiError } from "../../lib/api";
import { usePolling } from "../../lib/usePolling";
import {
  Badge,
  Button,
  Card,
  Input,
  Notice,
  SectionTitle,
  Spinner,
  Stepper,
} from "../../design/primitives";
import { IconAlert, IconChevronLeft, IconReceipt } from "../../design/icons";
import { formatBaht } from "../../lib/format";
import MealEnded from "./MealEnded";

// แยกบิล — §10
//
// หน้านี้เป็นเครื่องคิดเลข ไม่ใช่หน้าชำระเงิน ลูกค้ากดจ่ายเองไม่ได้โดยการออกแบบ
// เพราะทุกการรับเงินต้องมีพนักงานเป็นผู้รับผิดชอบ (ไม่มี webhook จากธนาคารในเวอร์ชันนี้)
// สิ่งที่หน้านี้ทำคือช่วยให้โต๊ะตกลงกันได้ว่าใครจ่ายเท่าไร แล้วยื่นตัวเลขให้พนักงานบันทึก
//
// สองโหมดตรงกับที่ระบบรองรับจริง: หารเท่ากันตามหัว และจ่ายเป็นก้อนจนครบยอด
// ทั้งสองแบบลงเป็นหลาย payment ต่อหนึ่งบิล และปิดโต๊ะได้เมื่อผลรวมเท่ายอดสุทธิพอดี

type Mode = "equal" | "custom";

export default function SplitPage() {
  const { token = "" } = useParams();
  const [mode, setMode] = useState<Mode>("equal");
  const [people, setPeople] = useState(0);
  const [amounts, setAmounts] = useState<string[]>([]);

  const fetcher = useCallback((signal: AbortSignal) => api.getVisit(token, signal), [token]);
  const { data, error, loading } = usePolling(fetcher, 10_000, Boolean(token));

  const total = useMemo(() => {
    if (!data) return 0;
    return Number(data.bill?.net_total ?? data.estimate.net_total ?? 0);
  }, [data]);

  const payingPax = data?.visit.paying_pax ?? 0;
  const headCount = people > 0 ? people : payingPax;
  const perHead = headCount > 0 ? Math.ceil(total / headCount) : 0;

  // เศษบาทตกที่คนแรกตามสูตรใน §10 — คนแรกจ่ายส่วนต่างที่ปัดขึ้นมาเกิน
  const firstPersonAdjust = perHead * headCount - total;

  const customTotal = amounts.reduce((sum, a) => sum + (Number(a) || 0), 0);
  const remaining = total - customTotal;

  if (loading && !data) return <Spinner label="กำลังโหลดบิล" />;

  if (error) {
    const gone = error instanceof ApiError && (error.isGone || error.status === 404);
    if (gone) return <MealEnded />;
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <Notice tone="brand" icon={<IconAlert className="size-4" />}>
          {error.message}
        </Notice>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 py-6">
      <header className="mb-4">
        <Link to={`/t/${token}`} className="mb-2 inline-flex">
          <Button variant="ghost" size="sm" icon={<IconChevronLeft className="size-4" />}>
            กลับหน้าโต๊ะ
          </Button>
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">แยกบิล</h1>
        <p className="mt-0.5 text-sm text-ink-faint">
          คำนวณให้ดูก่อน แล้วแจ้งพนักงานตอนชำระ
        </p>
      </header>

      <Card className="mb-3">
        <div className="flex items-baseline justify-between">
          <span className="text-ink-soft">ยอดที่ต้องชำระ</span>
          <span className="tabular text-3xl font-bold">{formatBaht(total)} ฿</span>
        </div>
        <p className="mt-1 text-xs text-ink-faint">
          {data.bill
            ? "ยอดนี้ถูกล็อกแล้วตอนขอเช็กบิล"
            : "ยอดประมาณการ · จะนิ่งเมื่อกดขอเช็กบิล"}
        </p>
      </Card>

      <div className="mb-3 flex gap-1 rounded-xl bg-sunken p-1">
        <button
          onClick={() => setMode("equal")}
          aria-pressed={mode === "equal"}
          className={`min-h-11 flex-1 rounded-lg text-sm font-semibold transition-colors ${
            mode === "equal" ? "bg-surface text-brand-700 shadow-card" : "text-ink-soft"
          }`}
        >
          หารเท่ากัน
        </button>
        <button
          onClick={() => setMode("custom")}
          aria-pressed={mode === "custom"}
          className={`min-h-11 flex-1 rounded-lg text-sm font-semibold transition-colors ${
            mode === "custom" ? "bg-surface text-brand-700 shadow-card" : "text-ink-soft"
          }`}
        >
          จ่ายคนละก้อน
        </button>
      </div>

      {mode === "equal" ? (
        <div className="space-y-3">
          <Card>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold">หารกี่คน</p>
                <p className="text-xs text-ink-faint">
                  ค่าเริ่มต้นคือ {payingPax} คนที่จ่ายเงิน (เด็กเล็กฟรีไม่นับ)
                </p>
              </div>
              <Stepper
                value={headCount}
                onChange={setPeople}
                min={1}
                max={30}
                label="จำนวนคนที่หาร"
                size="lg"
              />
            </div>
          </Card>

          <Card className="text-center">
            <p className="text-sm text-ink-soft">คนละ</p>
            <p className="tabular mt-1 text-5xl font-bold text-brand-500">
              {formatBaht(perHead)}
              <span className="ml-1 text-2xl">฿</span>
            </p>
            {firstPersonAdjust > 0 ? (
              <p className="mt-2 text-xs text-ink-faint">
                รวมแล้วเกินยอดจริง {formatBaht(firstPersonAdjust)} บาทจากการปัดขึ้น
                — คนแรกจ่าย {formatBaht(perHead - firstPersonAdjust)} บาทแทน
              </p>
            ) : (
              <p className="mt-2 text-xs text-ink-faint">หารลงตัวพอดี</p>
            )}
          </Card>

          <Notice tone="neutral" icon={<IconReceipt className="size-4" />}>
            แจ้งพนักงานว่าขอหารเท่ากัน {headCount} คน
            พนักงานจะบันทึกการรับเงินทีละคนจนครบยอด
          </Notice>
        </div>
      ) : (
        <div className="space-y-3">
          <Card>
            <SectionTitle
              action={
                <button
                  className="text-sm font-semibold text-brand-600"
                  onClick={() => setAmounts((prev) => [...prev, ""])}
                >
                  เพิ่มคน
                </button>
              }
            >
              ใครจ่ายเท่าไร
            </SectionTitle>

            {amounts.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-faint">
                กดเพิ่มคนเพื่อเริ่มกรอกจำนวนเงินของแต่ละคน
              </p>
            ) : (
              <ul className="space-y-2">
                {amounts.map((amount, index) => (
                  <li key={index} className="flex items-center gap-2">
                    <span className="w-16 text-sm text-ink-soft">คนที่ {index + 1}</span>
                    <Input
                      type="number"
                      min={0}
                      inputMode="decimal"
                      value={amount}
                      aria-label={`จำนวนเงินของคนที่ ${index + 1}`}
                      onChange={(e) =>
                        setAmounts((prev) =>
                          prev.map((v, i) => (i === index ? e.target.value : v)),
                        )
                      }
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setAmounts((prev) => prev.filter((_, i) => i !== index))
                      }
                    >
                      ลบ
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-ink-soft">รวมที่กรอก</span>
              <span className="tabular font-semibold">{formatBaht(customTotal)} ฿</span>
            </div>
            <div
              className={`mt-2 flex items-baseline justify-between text-lg font-bold ${
                remaining === 0
                  ? "text-ok-500"
                  : remaining < 0
                    ? "text-brand-600"
                    : "text-ink"
              }`}
            >
              <span>
                {remaining === 0 ? "ครบพอดี" : remaining < 0 ? "เกินยอด" : "ยังขาด"}
              </span>
              <span className="tabular">{formatBaht(Math.abs(remaining))} ฿</span>
            </div>

            {remaining < 0 ? (
              <Notice tone="warn">
                ยอดรวมเกินยอดบิล ระบบจะไม่ยอมให้บันทึกเกิน กรุณาปรับตัวเลขให้ไม่เกิน{" "}
                {formatBaht(total)} บาท
              </Notice>
            ) : null}
          </Card>

          <Notice tone="neutral" icon={<IconReceipt className="size-4" />}>
            แจ้งตัวเลขนี้กับพนักงาน แต่ละก้อนจะถูกบันทึกเป็นหนึ่งรายการชำระ
            และโต๊ะจะปิดได้เมื่อผลรวมเท่ายอดบิลพอดี
          </Notice>
        </div>
      )}

      <div className="mt-4">
        <Badge tone="neutral">
          ชำระที่โต๊ะได้ทั้งเงินสด · โอน · PromptPay
        </Badge>
      </div>
    </div>
  );
}

import { useState } from "react";
import { Link } from "react-router";
import { supabase } from "../../lib/supabase";
import { Button, Card, Field, Input, Notice, Stepper } from "../../design/primitives";
import { IconAlert, IconCheck, IconClock } from "../../design/icons";
import { formatClock } from "../../lib/format";

// จองโต๊ะล่วงหน้า — §06 กลุ่ม 2
//
// ยังไม่ผูกโต๊ะตั้งแต่ตอนจอง เพราะโต๊ะไหนจะว่างขึ้นกับหน้างานจริง
// สิ่งที่ลูกค้าได้คือสิทธิ์ให้ร้านกันโต๊ะไว้ 15 นาทีนับจากเวลานัด ไม่ใช่โต๊ะเจาะจง
// หน้านี้จึงต้องพูดเรื่องนี้ให้ชัดตั้งแต่แรก ไม่ให้ลูกค้าเข้าใจว่าจองโต๊ะหมายเลขได้

const BRANCH_ID = "11111111-1111-1111-1111-111111111111";
const HOLD_MINUTES = 15;

type Created = {
  reservation_id: string;
  reserved_for: string;
  hold_until: string;
  party_size: number;
};

/** ค่าเริ่มต้น: พรุ่งนี้ 18:00 ซึ่งเป็นช่วงที่คนจองมากที่สุด */
function defaultDateTime(): string {
  const when = new Date();
  when.setDate(when.getDate() + 1);
  when.setHours(18, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}T${pad(when.getHours())}:${pad(when.getMinutes())}`;
}

export default function ReservePage() {
  const [when, setWhen] = useState(defaultDateTime);
  const [partySize, setPartySize] = useState(4);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc("fn_create_reservation", {
        p_branch_id: BRANCH_ID,
        p_reserved_for: new Date(when).toISOString(),
        p_party_size: partySize,
        p_phone: phone.trim(),
      });
      if (rpcError) throw new Error(rpcError.message);
      setCreated(data as Created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "จองไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    const reservedFor = new Date(created.reserved_for);
    return (
      <div className="mx-auto min-h-dvh w-full max-w-md px-4 py-8">
        <Card className="text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-ok-100 text-ok-500">
            <IconCheck className="size-7" />
          </span>
          <h1 className="mt-3 text-2xl font-bold">จองเรียบร้อย</h1>
          <p className="mt-1 text-sm text-ink-faint">
            รหัสอ้างอิง {created.reservation_id.slice(0, 8).toUpperCase()}
          </p>

          <dl className="mt-5 divide-y divide-line text-left">
            <div className="flex justify-between py-2">
              <dt className="text-ink-soft">วันเวลา</dt>
              <dd className="tabular font-semibold">
                {reservedFor.toLocaleString("th-TH", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </dd>
            </div>
            <div className="flex justify-between py-2">
              <dt className="text-ink-soft">จำนวนคน</dt>
              <dd className="tabular font-semibold">{created.party_size} คน</dd>
            </div>
            <div className="flex justify-between py-2">
              <dt className="text-ink-soft">กันโต๊ะถึง</dt>
              <dd className="tabular font-semibold">
                {new Date(created.hold_until).toLocaleTimeString("th-TH", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </dd>
            </div>
          </dl>

          <Notice tone="warn" icon={<IconClock className="size-4" />}>
            ร้านกันโต๊ะให้ {formatClock(HOLD_MINUTES)} หลังเวลานัด
            หากมาช้ากว่านั้นโต๊ะจะถูกปล่อยและต้องรับคิวหน้าร้านตามปกติ
          </Notice>

          <Link to="/">
            <Button variant="outline" block className="mt-4">
              กลับหน้าแรก
            </Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-dvh w-full max-w-md px-4 py-8">
      <header className="mb-5">
        <h1 className="text-3xl font-bold tracking-tight">จองโต๊ะล่วงหน้า</h1>
        <p className="mt-1 text-sm text-ink-faint">
          ไม่ต้องสมัครสมาชิก ใช้เบอร์โทรอย่างเดียว
        </p>
      </header>

      <div className="space-y-3">
        {error ? (
          <Notice tone="brand" icon={<IconAlert className="size-4" />}>
            {error}
          </Notice>
        ) : null}

        <Card>
          <Field
            label="วันและเวลา"
            htmlFor="when"
            hint="จองล่วงหน้าได้ตั้งแต่ 30 นาที ถึง 30 วัน"
          >
            <Input
              id="when"
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
            />
          </Field>
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold">จำนวนคน</p>
              <p className="text-xs text-ink-faint">
                ใช้จัดขนาดโต๊ะ · ปรับหน้างานได้ถ้ามาไม่ครบ
              </p>
            </div>
            <Stepper
              value={partySize}
              onChange={setPartySize}
              min={1}
              max={20}
              label="จำนวนคน"
              size="lg"
            />
          </div>
        </Card>

        <Card>
          <Field
            label="เบอร์โทร"
            htmlFor="phone"
            hint="ร้านใช้ติดต่อกลับเท่านั้น และลบอัตโนมัติหลังจบมื้อ 24 ชั่วโมง"
          >
            <Input
              id="phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="08x-xxx-xxxx"
            />
          </Field>
        </Card>

        <Notice tone="neutral">
          การจองเป็นการกันสิทธิ์ ไม่ใช่การเลือกโต๊ะหมายเลข
          พนักงานจะจัดโต๊ะที่เหมาะกับจำนวนคนให้ตอนคุณมาถึง
        </Notice>

        <Button
          size="lg"
          block
          disabled={busy || phone.trim().length < 9}
          onClick={() => void submit()}
        >
          {busy ? "กำลังจอง…" : "ยืนยันการจอง"}
        </Button>

        <Link to="/">
          <Button variant="ghost" block>
            ไม่จอง ขอรับคิวหน้าร้านแทน
          </Button>
        </Link>
      </div>
    </div>
  );
}

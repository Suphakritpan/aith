import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { api, ApiError, newIdempotencyKey } from "../../lib/api";
import { Button, Card, Field, Input, Notice } from "../../design/primitives";
import { IconAlert, IconClock, IconUsers } from "../../design/icons";
import CustomerShell from "./CustomerShell";

// §04 ขั้นที่ 01 — ลูกค้ากดรับคิวเอง ระบบเลือกช่อง A/B/C ให้จากจำนวนคน
//
// ลูกค้าไม่ได้เลือกช่องเอง เพราะช่องผูกกับขนาดโต๊ะที่ร้านมีจริง ไม่ใช่ความชอบ
// แต่หน้าจอบอกให้รู้ว่ากำลังจะได้ช่องไหน เพื่อไม่ให้รู้สึกว่าระบบตัดสินใจลับหลัง

const SIZES = [1, 2, 3, 4, 5, 6, 8, 10];

function laneFor(partySize: number): { lane: string; hint: string } {
  if (partySize <= 2) return { lane: "A", hint: "1-2 คน" };
  if (partySize <= 4) return { lane: "B", hint: "3-4 คน" };
  return { lane: "C", hint: "5 คนขึ้นไป" };
}

export default function LandingPage() {
  const navigate = useNavigate();
  const [partySize, setPartySize] = useState(2);
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticketNo, setTicketNo] = useState<string | null>(null);

  // คีย์เดียวต่อการกรอกหนึ่งชุด กดซ้ำหรือ retry จะได้คิวใบเดิม ไม่ใช่ใบใหม่ (ADR-07)
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);

  const { lane, hint } = laneFor(partySize);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const created = await api.takeQueueTicket(
        { party_size: partySize, ...(phone.trim() ? { phone: phone.trim() } : {}) },
        idempotencyKey,
      );

      const token =
        (created.public_token as string | undefined) ??
        (created["token"] as string | undefined) ??
        (created["queue_token"] as string | undefined);

      if (token) {
        navigate(`/q/${token}`, { replace: true });
        return;
      }
      setTicketNo(created.ticket_no ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "รับคิวไม่สำเร็จ ลองใหม่อีกครั้ง");
      // คำขอล้มเหลว ให้คีย์ใหม่ เพื่อไม่ให้ติดคำตอบเดิมที่ค้างฝั่งเซิร์ฟเวอร์
      setIdempotencyKey(newIdempotencyKey());
    } finally {
      setSubmitting(false);
    }
  }

  if (ticketNo) {
    return (
      <CustomerShell title="รับคิวแล้ว" subtitle="จดเลขคิวไว้ แล้วรอเรียกที่หน้าร้าน">
        <Card className="text-center">
          <p className="text-sm text-ink-soft">เลขคิวของคุณ</p>
          <p className="tabular mt-2 text-6xl font-bold text-brand-500">{ticketNo}</p>
        </Card>
      </CustomerShell>
    );
  }

  return (
    <CustomerShell
      title="หมากระทุปุ๊ป๊ะ"
      subtitle="หิวปุ๊บ ป๊ะหมูกระทะปั๊บ — กดรับคิวได้เลย ไม่ต้องสมัครสมาชิก"
      footer={
        <Button size="lg" block onClick={() => void submit()} disabled={submitting}>
          {submitting ? "กำลังรับคิว…" : `รับคิวสำหรับ ${partySize} คน`}
        </Button>
      }
    >
      {error ? (
        <Notice tone="brand" icon={<IconAlert className="size-4" />}>
          {error}
        </Notice>
      ) : null}

      <Card>
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-semibold">มากันกี่คน</p>
          <span className="flex items-center gap-1.5 text-xs text-ink-faint">
            <IconUsers className="size-4" />
            ช่อง {lane} · {hint}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-4 gap-2">
          {SIZES.map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => setPartySize(size)}
              aria-pressed={partySize === size}
              className={`tabular min-h-13 rounded-xl border-2 text-lg font-bold transition-colors ${
                partySize === size
                  ? "border-brand-500 bg-brand-500 text-white"
                  : "border-line-strong bg-surface text-ink hover:bg-sunken"
              }`}
            >
              {size}
            </button>
          ))}
        </div>

        <p className="mt-2 text-xs text-ink-faint">
          ระบบจัดช่องคิวตามขนาดกลุ่ม เพื่อไม่ให้กลุ่มเล็กต้องรอโต๊ะใหญ่ว่าง
        </p>
      </Card>

      <Card>
        <Field
          label="เบอร์โทร (ไม่บังคับ)"
          htmlFor="phone"
          hint="ใส่ไว้เพื่อให้ร้านโทรตามตอนถึงคิว · ระบบลบเบอร์อัตโนมัติหลังปิดโต๊ะ 24 ชั่วโมง"
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

      <Card>
        <p className="flex items-center gap-2 text-sm font-semibold">
          <IconClock className="size-4 text-brand-500" />
          ราคาและเงื่อนไข
        </p>
        <ul className="mt-2 space-y-1 text-sm text-ink-soft">
          <li>บุฟเฟต์ต่อหัว ผู้ใหญ่ 289 บาท · เด็ก 189 บาท</li>
          <li>เด็กเล็กสูงไม่เกิน 90 ซม. ฟรี</li>
          <li>จำกัดเวลา 120 นาที เกินแล้วคิดเพิ่มเต็มรอบ</li>
          <li>น้ำดื่มรีฟิลไม่อั้น 39 บาทต่อคน เลือกได้ทีหลัง</li>
        </ul>
      </Card>

      <Link to="/reserve">
        <Button variant="outline" block>
          จองโต๊ะล่วงหน้าแทน
        </Button>
      </Link>
    </CustomerShell>
  );
}

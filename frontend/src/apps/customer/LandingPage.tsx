import { useState } from "react";
import { useNavigate } from "react-router";
import { api, ApiError, newIdempotencyKey } from "../../lib/api";
import { Button, Card, Notice, PageShell } from "../../components/ui";

// §04 ขั้นที่ 01 — ลูกค้ากดรับคิวเอง ระบบเลือกช่อง A/B/C ให้จากจำนวนคน
// ลูกค้าไม่ได้เลือกช่องเอง เพราะช่องผูกกับขนาดโต๊ะที่ร้านมี ไม่ใช่ความชอบ

const SIZES = [1, 2, 3, 4, 5, 6, 8, 10];

function laneFor(partySize: number): string {
  if (partySize <= 2) return "A";
  if (partySize <= 4) return "B";
  return "C";
}

export default function LandingPage() {
  const navigate = useNavigate();
  const [partySize, setPartySize] = useState(2);
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticketNo, setTicketNo] = useState<string | null>(null);

  // สร้างคีย์ครั้งเดียวต่อการกรอกหนึ่งชุด ถ้ากดซ้ำหรือ retry จะได้คิวใบเดิม ไม่ใช่ใบใหม่
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const created = await api.takeQueueTicket(
        { party_size: partySize, ...(phone.trim() ? { phone: phone.trim() } : {}) },
        idempotencyKey,
      );

      // ชื่อฟิลด์ของ token อาจต่างกันตามรุ่นของ API จึงรับหลายชื่อ
      const token =
        (created.public_token as string | undefined) ??
        (created["token"] as string | undefined) ??
        (created["queue_token"] as string | undefined);

      if (token) {
        navigate(`/q/${token}`, { replace: true });
        return;
      }

      // ไม่มี token ให้ติดตามต่อ อย่างน้อยต้องบอกเลขคิวให้ลูกค้าจดไว้
      setTicketNo(created.ticket_no ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "รับคิวไม่สำเร็จ ลองใหม่อีกครั้ง");
      // คำขอไม่สำเร็จ ให้คีย์ใหม่เพื่อไม่ให้ติดคำตอบเดิมที่ค้างอยู่ฝั่งเซิร์ฟเวอร์
      setIdempotencyKey(newIdempotencyKey());
    } finally {
      setSubmitting(false);
    }
  }

  if (ticketNo) {
    return (
      <PageShell title="รับคิวแล้ว" subtitle="กรุณาจดเลขคิวไว้ และรอเรียกที่หน้าร้าน">
        <Card className="text-center">
          <p className="text-sm text-muted-strong">เลขคิวของคุณ</p>
          <p className="tabular mt-2 text-6xl font-bold text-brand-500">{ticketNo}</p>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="หมากระทุปุ๊ป๊ะ"
      subtitle="หิวปุ๊บ ป๊ะหมูกระทะปั๊บ — กดรับคิวได้เลย ไม่ต้องสมัครสมาชิก"
      footer={
        <Button size="lg" onClick={submit} disabled={submitting}>
          {submitting ? "กำลังรับคิว…" : `รับคิวสำหรับ ${partySize} คน`}
        </Button>
      }
    >
      {error ? <Notice tone="error">{error}</Notice> : null}

      <Card>
        <p className="text-sm font-semibold">มากันกี่คน</p>
        <p className="mt-1 text-xs text-muted">
          ระบบจะจัดช่องคิวให้ตามขนาดกลุ่ม — ช่อง {laneFor(partySize)}
        </p>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {SIZES.map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => setPartySize(size)}
              aria-pressed={partySize === size}
              className={`tabular min-h-12 rounded-xl border text-base font-semibold transition ${
                partySize === size
                  ? "border-brand-500 bg-brand-500 text-white"
                  : "border-divider bg-surface text-ink active:bg-brand-100"
              }`}
            >
              {size}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <label htmlFor="phone" className="text-sm font-semibold">
          เบอร์โทร <span className="font-normal text-muted">(ไม่บังคับ)</span>
        </label>
        <p className="mt-1 text-xs text-muted">
          ใส่ไว้เพื่อให้ร้านโทรตามตอนถึงคิว — ระบบลบเบอร์อัตโนมัติหลังปิดโต๊ะ 24 ชั่วโมง
        </p>
        <input
          id="phone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="08x-xxx-xxxx"
          className="mt-3 min-h-12 w-full rounded-xl border border-divider bg-ground px-4 text-base outline-none focus:border-brand-400"
        />
      </Card>

      <p className="px-1 text-xs leading-relaxed text-muted">
        บุฟเฟต์ต่อหัว · ผู้ใหญ่ 289 บาท · เด็กเล็กสูงไม่เกิน 90 ซม. ฟรี · จำกัดเวลา 120 นาที
      </p>
    </PageShell>
  );
}

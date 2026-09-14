import { useCallback, useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { api, ApiError } from "../../lib/api";
import { usePolling } from "../../lib/usePolling";
import { Badge, Button, Card, Notice, Spinner } from "../../design/primitives";
import { IconAlert, IconBell, IconClock } from "../../design/icons";
import { formatClock } from "../../lib/format";
import CustomerShell from "./CustomerShell";

// §04 ขั้นที่ 02-03 — ลูกค้าเห็นลำดับคิวและเวลารอของตัวเอง
//
// เมื่อพนักงานเปิดโต๊ะให้ คำตอบจะมี qr_token กลับมา หน้าจอพาไปหน้าโต๊ะทันที
// ลูกค้าที่ถือหน้านี้ค้างไว้จึงไม่ต้องสแกน QR ซ้ำอีก
//
// สถานะ NO_SHOW เป็นปลายทาง ไม่ใช่ข้อความเตือน — เมื่อถูกตัดคิวแล้ว
// การถามซ้ำต่อไปไม่มีประโยชน์ หน้าจอจึงหยุดและบอกทางออกที่ทำได้จริง

const STATUS_TEXT: Record<string, { label: string; tone: "neutral" | "brand" | "warn" }> = {
  WAITING: { label: "รอเรียก", tone: "neutral" },
  CALLED: { label: "ถึงคิวแล้ว เชิญที่เคาน์เตอร์", tone: "brand" },
  SEATED: { label: "เข้าโต๊ะแล้ว", tone: "brand" },
  NO_SHOW: { label: "คิวถูกตัด", tone: "warn" },
  CANCELLED: { label: "ยกเลิกแล้ว", tone: "warn" },
};

export default function QueuePage() {
  const { token = "" } = useParams();
  const navigate = useNavigate();

  const fetcher = useCallback(
    (signal: AbortSignal) => api.getQueueTicket(token, signal),
    [token],
  );
  const { data, error, loading } = usePolling(fetcher, 5000, Boolean(token));

  useEffect(() => {
    if (data?.qr_token) navigate(`/t/${data.qr_token}`, { replace: true });
  }, [data?.qr_token, navigate]);

  if (loading && !data) {
    return (
      <CustomerShell title="คิวของคุณ">
        <Spinner label="กำลังดูลำดับคิว" />
      </CustomerShell>
    );
  }

  if (error) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <CustomerShell title="คิวของคุณ">
        <Notice tone="brand" icon={<IconAlert className="size-4" />}>
          {notFound ? "ไม่พบคิวใบนี้ อาจหมดอายุหรือลิงก์ไม่ถูกต้อง" : error.message}
        </Notice>
        <Link to="/">
          <Button block className="mt-2">
            รับคิวใหม่
          </Button>
        </Link>
      </CustomerShell>
    );
  }

  if (!data) return null;

  // ปลายทาง: คิวถูกตัดเพราะเรียกครบสามครั้งแล้วไม่มา (BR-09)
  if (data.status === "NO_SHOW") {
    return (
      <CustomerShell title="คิวถูกตัดแล้ว">
        <Card className="text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-warn-100 text-warn-500">
            <IconBell className="size-7" />
          </span>
          <p className="tabular mt-3 text-4xl font-bold text-ink-faint line-through">
            {data.ticket_no}
          </p>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
            ร้านเรียกคิวนี้ครบสามครั้งแล้วแต่ไม่พบผู้รับ ระบบจึงตัดคิวเพื่อให้กลุ่มถัดไปได้เข้าก่อน
          </p>
        </Card>

        <Notice tone="neutral">
          ถ้ายังอยู่ที่ร้าน กรุณาแจ้งพนักงานที่เคาน์เตอร์ หรือกดรับคิวใหม่ได้เลย
        </Notice>

        <Link to="/">
          <Button size="lg" block>
            รับคิวใหม่
          </Button>
        </Link>
      </CustomerShell>
    );
  }

  if (data.status === "CANCELLED") {
    return (
      <CustomerShell title="คิวถูกยกเลิก">
        <Notice tone="neutral">คิวใบนี้ถูกยกเลิกแล้ว</Notice>
        <Link to="/">
          <Button size="lg" block>
            รับคิวใหม่
          </Button>
        </Link>
      </CustomerShell>
    );
  }

  const status = STATUS_TEXT[data.status] ?? { label: data.status, tone: "neutral" as const };
  const isCalled = data.status === "CALLED";

  return (
    <CustomerShell title="คิวของคุณ" subtitle={`สำหรับ ${data.party_size} คน`}>
      <Card className={`text-center ${isCalled ? "attention" : ""}`}>
        <p className="text-sm text-ink-soft">เลขคิว</p>
        <p className="tabular mt-1 text-6xl font-bold text-brand-500">{data.ticket_no}</p>
        <div className="mt-3">
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
      </Card>

      {isCalled ? (
        <Notice tone="warn" icon={<IconBell className="size-4" />}>
          ถึงคิวของคุณแล้ว กรุณามาที่เคาน์เตอร์ — ร้านเรียกได้สูงสุด 3 ครั้ง
          ห่างกันครั้งละ 2 นาที ถ้าไม่มาจะถูกตัดคิวอัตโนมัติ
        </Notice>
      ) : null}

      {data.status === "WAITING" ? (
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <p className="text-xs text-ink-faint">คิวก่อนหน้า</p>
            <p className="tabular mt-1 text-3xl font-bold">{data.ahead}</p>
          </Card>
          <Card>
            <p className="flex items-center gap-1 text-xs text-ink-faint">
              <IconClock className="size-3.5" />
              รอโดยประมาณ
            </p>
            <p className="tabular mt-1 text-xl font-bold">
              {data.estimated_wait_minutes === null
                ? "—"
                : formatClock(data.estimated_wait_minutes)}
            </p>
          </Card>
        </div>
      ) : null}

      <p className="px-1 text-xs leading-relaxed text-ink-faint">
        หน้านี้อัปเดตเองทุก 5 วินาที เปิดค้างไว้ได้เลย
        เมื่อร้านจัดโต๊ะให้แล้วระบบจะพาไปหน้าสั่งอาหารอัตโนมัติ
      </p>
    </CustomerShell>
  );
}

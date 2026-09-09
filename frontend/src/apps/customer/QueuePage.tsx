import { useCallback, useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import { api, ApiError } from "../../lib/api";
import { usePolling } from "../../lib/usePolling";
import { Badge, Card, Notice, PageShell, Spinner } from "../../components/ui";
import { formatClock } from "../../lib/format";

// §04 ขั้นที่ 02-03 — ลูกค้าเห็นลำดับคิวและเวลารอโดยประมาณของตัวเอง
// เมื่อพนักงานเปิดโต๊ะให้แล้ว คำตอบจะมี qr_token กลับมา หน้าจอพาไปหน้าโต๊ะให้ทันที
// ลูกค้าจึงไม่ต้องสแกน QR ซ้ำถ้ายังถือหน้านี้ค้างไว้

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

  // พาไปหน้าโต๊ะทันทีที่ร้านเปิด Visit ให้
  useEffect(() => {
    if (data?.qr_token) navigate(`/t/${data.qr_token}`, { replace: true });
  }, [data?.qr_token, navigate]);

  if (loading && !data) {
    return (
      <PageShell title="คิวของคุณ">
        <Spinner label="กำลังดูลำดับคิว" />
      </PageShell>
    );
  }

  if (error) {
    const gone = error instanceof ApiError && error.status === 404;
    return (
      <PageShell title="คิวของคุณ">
        <Notice tone="error">
          {gone ? "ไม่พบคิวใบนี้ อาจหมดอายุหรือลิงก์ไม่ถูกต้อง" : error.message}
        </Notice>
      </PageShell>
    );
  }

  if (!data) return null;

  const status = STATUS_TEXT[data.status] ?? { label: data.status, tone: "neutral" as const };
  const isCalled = data.status === "CALLED";

  return (
    <PageShell title="คิวของคุณ" subtitle={`สำหรับ ${data.party_size} คน`}>
      <Card className="text-center">
        <p className="text-sm text-muted-strong">เลขคิว</p>
        <p className="tabular mt-1 text-6xl font-bold text-brand-500">{data.ticket_no}</p>
        <div className="mt-3">
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
      </Card>

      {isCalled ? (
        <Notice tone="warn">
          ถึงคิวของคุณแล้ว กรุณามาที่เคาน์เตอร์ — ร้านเรียกได้สูงสุด 3 ครั้ง
          ห่างกันครั้งละ 2 นาที ถ้าไม่มาจะถูกตัดคิวโดยอัตโนมัติ
        </Notice>
      ) : null}

      {data.status === "NO_SHOW" ? (
        <Notice tone="error">
          คิวนี้ถูกตัดแล้วเพราะเรียกครบสามครั้งไม่พบผู้รับ กรุณารับคิวใหม่ที่หน้าร้าน
        </Notice>
      ) : null}

      {data.status === "WAITING" ? (
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <p className="text-xs text-muted">คิวก่อนหน้า</p>
            <p className="tabular mt-1 text-3xl font-bold">{data.ahead}</p>
          </Card>
          <Card>
            <p className="text-xs text-muted">รอโดยประมาณ</p>
            <p className="tabular mt-1 text-xl font-bold">
              {data.estimated_wait_minutes === null
                ? "—"
                : formatClock(data.estimated_wait_minutes)}
            </p>
          </Card>
        </div>
      ) : null}

      <p className="px-1 text-xs leading-relaxed text-muted">
        หน้านี้อัปเดตเองทุก 5 วินาที เปิดค้างไว้ได้เลย
        เมื่อร้านจัดโต๊ะให้แล้วระบบจะพาไปหน้าสั่งอาหารอัตโนมัติ
      </p>
    </PageShell>
  );
}

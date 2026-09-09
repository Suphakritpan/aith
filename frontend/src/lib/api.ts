// ตัวเรียก Edge Function `api`
//
// ทุกคำขอที่สร้างข้อมูลต้องส่ง Idempotency-Key (ADR-07) ตัวช่วยนี้จึงสร้างคีย์ให้เอง
// และ "จำ" คีย์ต่อการกดหนึ่งครั้ง เพื่อว่าถ้าเน็ตช้าแล้วผู้ใช้กดซ้ำ หรือเรา retry เอง
// เซิร์ฟเวอร์จะรู้ว่าเป็นคำขอเดิมและตอบคำตอบเดิมกลับมา แทนที่จะสร้างของซ้ำ

import type {
  QueueBoardView,
  QueueTicketCreated,
  QueueTicketView,
  VisitView,
} from "./types";

const BASE = import.meta.env.VITE_API_BASE_URL || "/api";
const APIKEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** มื้อนี้จบแล้ว หรือ QR ถูกเพิกถอน — หน้าจอต้องพาผู้ใช้ออกจากหน้าโต๊ะ (BR-02) */
  get isGone(): boolean {
    return this.status === 410 || this.status === 401;
  }
}

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH";
  body?: unknown;
  idempotencyKey?: string;
  signal?: AbortSignal;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, idempotencyKey, signal } = options;

  const headers: Record<string, string> = {};
  if (APIKEY) headers.apikey = APIKEY;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });

  const text = await res.text();
  const payload: unknown = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
        : `คำขอไม่สำเร็จ (${res.status})`;
    throw new ApiError(res.status, message);
  }

  return payload as T;
}

export const api = {
  /** รับคิว — §04 ขั้นที่ 01 ระบบเลือกช่อง A/B/C ให้เองจากจำนวนคน */
  takeQueueTicket(input: { party_size: number; phone?: string }, key: string) {
    return request<QueueTicketCreated>("/queue/tickets", {
      method: "POST",
      body: input,
      idempotencyKey: key,
    });
  },

  /** ดูลำดับคิวของตัวเอง ด้วย token ที่ได้ตอนรับคิว */
  getQueueTicket(publicToken: string, signal?: AbortSignal) {
    return request<QueueTicketView>(`/queue/tickets/${publicToken}`, { signal });
  },

  /** จอคิวหน้าร้าน — อ่านอย่างเดียว ไม่ต้องมี token */
  getQueueBoard(signal?: AbortSignal) {
    return request<QueueBoardView>("/queue/board", { signal });
  },

  /** หน้าโต๊ะทั้งหน้าในคำขอเดียว — เมนู เวลาคงเหลือ ออเดอร์ และยอดปัจจุบัน */
  getVisit(qrToken: string, signal?: AbortSignal) {
    return request<VisitView>(`/c/${qrToken}`, { signal });
  },

  /** สั่งอาหาร สั่งได้หลายรอบตลอดมื้อ (BR-01 บังคับสถานะที่ฝั่งฐานข้อมูล) */
  placeOrder(
    qrToken: string,
    items: { menu_item_id: string; qty: number }[],
    key: string,
  ) {
    return request<unknown>(`/c/${qrToken}/orders`, {
      method: "POST",
      body: { items },
      idempotencyKey: key,
    });
  },

  /** เลือกน้ำรีฟิลรายคน — เก็บเป็นจำนวน ไม่ระบุตัวบุคคล (ADR-03) */
  setAddon(qrToken: string, qty: number, key: string) {
    return request<unknown>(`/c/${qrToken}/addons`, {
      method: "POST",
      body: { qty },
      idempotencyKey: key,
    });
  },

  /** เรียกพนักงาน — เซิร์ฟเวอร์กันการกดรัวด้วยการตอบ 429 */
  callStaff(qrToken: string, type: string, key: string) {
    return request<unknown>(`/c/${qrToken}/service-calls`, {
      method: "POST",
      body: { type },
      idempotencyKey: key,
    });
  },

  /** ขอเช็กบิล — ล็อกการสั่งใหม่ทันทีและ snapshot ยอด (§04 ขั้นที่ 10) */
  requestBill(qrToken: string, key: string) {
    return request<{ bill: unknown }>(`/c/${qrToken}/bill`, {
      method: "POST",
      body: {},
      idempotencyKey: key,
    });
  },
};

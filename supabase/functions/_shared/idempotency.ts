// Idempotency-Key — ADR-07
//
// การกดซ้ำตอนเน็ตช้าเป็นสาเหตุอันดับหนึ่งของออเดอร์ผีและยอดเกิน ซึ่งเกิดจากฝั่ง network
// ไม่ใช่ฝั่งปุ่ม การ disable ปุ่มใน UI จึงแก้ไม่ตรงจุด
//
// กลไก: คำขอที่สร้างข้อมูลต้องส่งหัว Idempotency-Key มาด้วย ครั้งแรกเราทำงานจริงแล้วจำคำตอบไว้
// ครั้งต่อ ๆ ไปที่คีย์เดิมมาถึง เราคืนคำตอบเดิมโดยไม่ทำงานซ้ำ
// ถ้าคีย์เดิมแต่ body ต่างออกไป แปลว่า client ใช้คีย์ผิด จึงตอบ 422 แทนที่จะทำตาม

import { admin } from "./db.ts";
import { AppError, badRequest } from "./errors.ts";
import { json } from "./http.ts";

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type Replayable = { status: number; body: unknown };

/**
 * ห่อการทำงานที่สร้างข้อมูลให้ปลอดภัยต่อการกดซ้ำ
 *
 * @param req      คำขอที่เข้ามา — ใช้อ่านหัว Idempotency-Key และ body
 * @param endpoint ชื่อ endpoint สำหรับแยกคีย์ที่บังเอิญซ้ำกันข้าม endpoint
 * @param work     งานจริง จะถูกเรียกเพียงครั้งเดียวต่อหนึ่งคีย์
 */
export async function idempotent(
  req: Request,
  endpoint: string,
  work: (body: unknown) => Promise<Replayable>,
): Promise<Response> {
  const key = req.headers.get("Idempotency-Key");
  if (!key || key.length < 8) {
    throw badRequest("ต้องส่งหัว Idempotency-Key ความยาวอย่างน้อย 8 ตัวอักษร");
  }

  const raw = await req.text();
  const body = raw ? JSON.parse(raw) : {};
  const hash = await sha256(`${endpoint}\n${raw}`);

  const { data: existing } = await admin
    .from("idempotency_record")
    .select("request_hash, status_code, response")
    .eq("key", key)
    .maybeSingle();

  if (existing) {
    if (existing.request_hash !== hash) {
      throw new AppError(
        422,
        "IDEMPOTENCY_MISMATCH",
        "Idempotency-Key นี้ถูกใช้กับข้อมูลชุดอื่นไปแล้ว",
      );
    }
    // ตอบคำตอบเดิม พร้อมบอกว่าเป็นการเล่นซ้ำ เผื่อฝั่งหน้าจอต้องการรู้
    return json(existing.response, existing.status_code, { "Idempotent-Replay": "true" });
  }

  const result = await work(body);

  // จดคำตอบไว้เฉพาะกรณีสำเร็จ ถ้าล้มเหลวควรให้ลองใหม่ได้ด้วยคีย์เดิม
  if (result.status < 400) {
    await admin.from("idempotency_record").insert({
      key,
      endpoint,
      request_hash: hash,
      status_code: result.status,
      response: result.body,
    });
  }

  return json(result.body, result.status);
}

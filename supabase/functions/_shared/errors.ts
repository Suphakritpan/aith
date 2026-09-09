// ข้อผิดพลาดที่ตอบกลับ client
//
// รหัสสถานะที่ใช้ยึดตามตาราง §09 ของ Read/System Design.md
// ข้อความเป็นภาษาไทยเพราะไปแสดงบนหน้าจอพนักงานตรง ๆ ไม่ได้ผ่านชั้นแปลอีกที

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (m: string) => new AppError(400, "BAD_REQUEST", m);
export const unauthorized = (m: string) => new AppError(401, "UNAUTHORIZED", m);
export const forbidden = (m: string) => new AppError(403, "FORBIDDEN", m);
export const notFound = (m: string) => new AppError(404, "NOT_FOUND", m);
export const conflict = (m: string) => new AppError(409, "CONFLICT", m);
export const gone = (m: string) => new AppError(410, "GONE", m);
export const unprocessable = (m: string) => new AppError(422, "UNPROCESSABLE", m);
export const tooManyRequests = (m: string) => new AppError(429, "TOO_MANY_REQUESTS", m);

// trigger และ constraint ในฐานข้อมูลเป็นด่านสุดท้ายของกฎธุรกิจ (§01)
// เมื่อมันปฏิเสธ เราส่งข้อความของมันกลับไปตรง ๆ เพราะเขียนไว้ให้คนอ่านอยู่แล้ว
// และแปลงรหัสของ Postgres เป็นรหัส HTTP ที่ตรงกับความหมาย
export function fromPostgres(err: { code?: string; message?: string }): AppError {
  const message = (err.message ?? "").replace(/^ERROR:\s*/, "");

  switch (err.code) {
    case "23505": // unique_violation — ส่วนใหญ่คือ Idempotency-Key ซ้ำ
      return new AppError(409, "DUPLICATE", message);
    case "23503": // foreign_key_violation
      return new AppError(422, "BAD_REFERENCE", message);
    case "23514": // check_violation — กฎธุรกิจที่เขียนเป็น CHECK
    case "P0001": // raise exception จาก trigger
      return new AppError(422, "RULE_VIOLATION", message);
    case "42501": // insufficient_privilege — RLS ปฏิเสธ
      return new AppError(403, "FORBIDDEN", "สิทธิ์ไม่พอสำหรับรายการนี้");
    default:
      return new AppError(500, "DB_ERROR", message || "ฐานข้อมูลตอบกลับผิดพลาด");
  }
}

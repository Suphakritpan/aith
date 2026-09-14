// ตัวช่วยระดับ HTTP: CORS, การอ่าน body, และ router เล็ก ๆ ที่จับ path เป็นแพตเทิร์น
//
// Edge Function หนึ่งตัวรับหลาย path ตามตาราง §09 เช่น /queue/tickets และ
// /queue/tickets/:id/call จึงต้องมี router ในตัว ไม่ใช่หนึ่งฟังก์ชันต่อหนึ่ง endpoint

import { AppError } from "./errors.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, idempotency-key, x-staff-pin",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
};

export function json(body: unknown, status = 200, extra: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, ...extra, "Content-Type": "application/json; charset=utf-8" },
  });
}

export function preflight(): Response {
  return new Response("ok", { headers: CORS });
}

export type Params = Record<string, string>;
export type Handler = (req: Request, params: Params) => Promise<Response>;

type Route = { method: string; parts: string[]; handler: Handler };

export class Router {
  private routes: Route[] = [];

  add(method: string, pattern: string, handler: Handler): this {
    this.routes.push({
      method,
      parts: pattern.split("/").filter(Boolean),
      handler,
    });
    return this;
  }

  get(p: string, h: Handler) { return this.add("GET", p, h); }
  post(p: string, h: Handler) { return this.add("POST", p, h); }
  patch(p: string, h: Handler) { return this.add("PATCH", p, h); }

  // Supabase เรียก Edge Function ที่ /functions/v1/<ชื่อฟังก์ชัน>/<ที่เหลือ>
  // เราตัดสองส่วนหน้าทิ้งแล้วจับคู่เฉพาะส่วนที่เหลือ
  private static pathParts(url: string): string[] {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    const i = parts.indexOf("v1");
    return i >= 0 ? parts.slice(i + 2) : parts;
  }

  async handle(req: Request): Promise<Response> {
    if (req.method === "OPTIONS") return preflight();

    const parts = Router.pathParts(req.url);

    for (const route of this.routes) {
      if (route.method !== req.method) continue;
      if (route.parts.length !== parts.length) continue;

      const params: Params = {};
      let matched = true;
      for (let i = 0; i < route.parts.length; i++) {
        const spec = route.parts[i];
        if (spec.startsWith(":")) params[spec.slice(1)] = decodeURIComponent(parts[i]);
        else if (spec !== parts[i]) { matched = false; break; }
      }
      if (!matched) continue;

      return await route.handler(req, params);
    }

    return json({ error: "NOT_FOUND", message: "ไม่พบ endpoint นี้" }, 404);
  }
}

// ห่อ handler ทั้งตัวไว้ให้ error กลายเป็น response ที่มีรูปแบบเดียวกันเสมอ
// ไม่ปล่อยให้ stack trace หลุดออกไปหา client
export function serveRouter(router: Router) {
  return async (req: Request): Promise<Response> => {
    try {
      return await router.handle(req);
    } catch (err) {
      if (err instanceof AppError) {
        return json({ error: err.code, message: err.message }, err.status);
      }
      console.error("unhandled", err);
      return json({ error: "INTERNAL", message: "ระบบขัดข้อง" }, 500);
    }
  };
}

import { useCallback } from "react";
import { api } from "../../lib/api";
import { usePolling, useNow } from "../../lib/usePolling";
import type { QueueLane } from "../../lib/types";

// จอคิวหน้าร้าน — โหมดอ่านอย่างเดียว
//
// ออกแบบให้อ่านจากระยะสามถึงห้าเมตร ตัวเลขคิวจึงใหญ่กว่าทุกหน้าจออื่นในระบบมาก
// และไม่มีอะไรกดได้เลยสักอย่าง เพราะจอนี้ไม่มีคนเฝ้าและมักเป็นจอสัมผัสที่คนเดินชน
//
// ไม่ต้องล็อกอินและไม่มีข้อมูลส่วนบุคคลบนจอ — แสดงเฉพาะเลขคิวกับจำนวนคน
// เบอร์โทรของลูกค้าไม่ถูกส่งมาที่ endpoint นี้เลยตามหลัก PDPA ใน §12

const LANES: { id: QueueLane; label: string; hint: string }[] = [
  { id: "A", label: "A", hint: "1 – 2 คน" },
  { id: "B", label: "B", hint: "3 – 4 คน" },
  { id: "C", label: "C", hint: "5 คนขึ้นไป" },
];

export default function DisplayPage() {
  const now = useNow(1000);
  const fetcher = useCallback((signal: AbortSignal) => api.getQueueBoard(signal), []);
  const { data, error } = usePolling(fetcher, 5000);

  const tickets = data?.tickets ?? [];
  const calling = tickets.filter((t) => t.status === "CALLED");

  const clock = new Date(now).toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="flex min-h-dvh flex-col bg-ink text-white">
      <header className="flex items-baseline justify-between px-8 pt-8 pb-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">หมากระทุปุ๊ป๊ะ</h1>
          <p className="mt-1 text-lg text-white/60">คิวหน้าร้าน</p>
        </div>
        <p className="tabular text-4xl font-bold text-white/80">{clock}</p>
      </header>

      {/* คิวที่กำลังเรียก — ใหญ่ที่สุดบนจอ เพราะเป็นข้อมูลเดียวที่ต้องทำอะไรต่อทันที */}
      <section className="mx-8 rounded-3xl bg-brand-500 px-8 py-6">
        <p className="text-xl font-semibold text-white/80">กำลังเรียก</p>
        {calling.length === 0 ? (
          <p className="py-4 text-4xl font-bold text-white/50">— ยังไม่มีคิวที่เรียก —</p>
        ) : (
          <div className="flex flex-wrap gap-x-12 gap-y-4 py-2">
            {calling.map((ticket) => (
              <p
                key={ticket.ticket_no}
                className="tabular text-8xl leading-none font-bold attention rounded-2xl px-2"
              >
                {ticket.ticket_no}
              </p>
            ))}
          </div>
        )}
      </section>

      <section className="grid flex-1 grid-cols-3 gap-6 p-8">
        {LANES.map((lane) => {
          const rows = tickets.filter((t) => t.lane === lane.id && t.status === "WAITING");
          return (
            <div
              key={lane.id}
              className="flex flex-col rounded-3xl border border-white/15 bg-white/5 p-6"
            >
              <div className="flex items-baseline justify-between border-b border-white/15 pb-3">
                <p className="text-5xl font-bold">{lane.label}</p>
                <p className="text-lg text-white/60">{lane.hint}</p>
              </div>

              <p className="mt-3 text-base text-white/60">รออยู่ {rows.length} กลุ่ม</p>

              <ul className="mt-2 space-y-2 overflow-hidden">
                {rows.slice(0, 6).map((ticket) => (
                  <li
                    key={ticket.ticket_no}
                    className="tabular flex items-baseline justify-between text-4xl font-bold"
                  >
                    <span>{ticket.ticket_no}</span>
                    <span className="text-xl font-medium text-white/50">
                      {ticket.party_size} คน
                    </span>
                  </li>
                ))}
                {rows.length > 6 ? (
                  <li className="pt-1 text-xl text-white/50">
                    และอีก {rows.length - 6} กลุ่ม
                  </li>
                ) : null}
                {rows.length === 0 ? (
                  <li className="py-6 text-2xl text-white/30">ไม่มีคิวรอ</li>
                ) : null}
              </ul>
            </div>
          );
        })}
      </section>

      <footer className="flex items-center justify-between px-8 pb-6 text-base text-white/40">
        <p>สแกน QR ที่เคาน์เตอร์เพื่อรับคิวด้วยตัวเอง · บุฟเฟต์ 120 นาที</p>
        {error ? (
          <p className="text-warn-500">การเชื่อมต่อขัดข้อง กำลังลองใหม่</p>
        ) : (
          <p>อัปเดตทุก 5 วินาที</p>
        )}
      </footer>
    </div>
  );
}

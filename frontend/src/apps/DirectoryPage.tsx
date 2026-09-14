import { useEffect, useState } from "react";
import { Link } from "react-router";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { Badge, Button, Card, Input, Notice, SectionTitle } from "../design/primitives";
import { IconChevronRight } from "../design/icons";

// สารบัญทุกหน้าในระบบ
//
// มีไว้เพื่อเดินดูงานทั้งหมดได้จากที่เดียวตอนพัฒนาและตอนสาธิต
// สองหน้าของลูกค้าต้องใช้ token ประจำมื้อ หน้านี้จึงดึง token ที่ใช้งานได้จริงมาให้
// เมื่อล็อกอินเป็นพนักงาน เพราะการก๊อป token จากฐานข้อมูลเองทุกครั้งเสียเวลาเกินจำเป็น

type Group = {
  title: string;
  note: string;
  routes: { to: string; label: string; detail: string; needsLogin?: boolean }[];
};

const GROUPS: Group[] = [
  {
    title: "ลูกค้า",
    note: "เปิดในเบราว์เซอร์มือถือ ไม่ต้องล็อกอิน · ออกแบบให้ใช้มือเดียว",
    routes: [
      { to: "/", label: "รับคิว", detail: "เลือกจำนวนคน ระบบจัดช่องคิวให้เอง" },
      { to: "/reserve", label: "จองโต๊ะล่วงหน้า", detail: "กันโต๊ะให้ 15 นาทีหลังเวลานัด" },
    ],
  },
  {
    title: "จอหน้าร้าน",
    note: "เปิดค้างบนทีวี ไม่ต้องล็อกอิน และไม่มีอะไรกดได้",
    routes: [
      { to: "/display", label: "จอคิว TV", detail: "คิวที่กำลังเรียก แยกช่อง A/B/C อ่านจากไกลได้" },
    ],
  },
  {
    title: "พนักงาน",
    note: "ต้องล็อกอิน · ออกแบบสำหรับแท็บเล็ตและการทำงานเร็ว",
    routes: [
      { to: "/staff", label: "แดชบอร์ด", detail: "คำเรียก โต๊ะเกินเวลา และภาพรวมทั้งกะ", needsLogin: true },
      { to: "/staff/queue", label: "คิว", detail: "เรียกคิวและจัดโต๊ะ แยกช่อง A/B/C", needsLogin: true },
      { to: "/staff/floor", label: "ผังโต๊ะ", detail: "สถานะทุกโต๊ะพร้อมเวลานับถอยหลัง", needsLogin: true },
      { to: "/staff/kitchen", label: "ครัว", detail: "คิวอาหาร รับออเดอร์ และกดเสิร์ฟ", needsLogin: true },
      { to: "/staff/reservations", label: "การจอง", detail: "กันโต๊ะ ปล่อยการจอง และเปิดโต๊ะให้ลูกค้าที่จองไว้", needsLogin: true },
    ],
  },
  {
    title: "เจ้าของร้าน",
    note: "ต้องเป็นหัวหน้ากะขึ้นไป · ราคาแก้ได้เฉพาะเจ้าของร้าน",
    routes: [
      { to: "/admin", label: "ภาพรวม", detail: "ยอดขาย รอบโต๊ะ ช่วงเวลาหนาแน่น เมนูขายดี", needsLogin: true },
      { to: "/admin/menu", label: "เมนู", detail: "ปิดเมนูของหมด (86 list)", needsLogin: true },
      { to: "/admin/packages", label: "แพ็กเกจและราคา", detail: "ราคา 289 / เด็ก / รีฟิล 39 และระยะเวลาแพ็กเกจ", needsLogin: true },
      { to: "/admin/tables", label: "โซนและโต๊ะ", detail: "จำนวนที่นั่ง ซึ่งเป็นตัวตั้งของการจัดช่องคิว", needsLogin: true },
      { to: "/admin/staff", label: "พนักงานและสิทธิ์", detail: "สามบทบาทและการตั้ง PIN", needsLogin: true },
      { to: "/admin/stock", label: "นับสต๊อก", detail: "ยอดต้น-ปลายวันและของเสีย", needsLogin: true },
      { to: "/admin/visits", label: "ประวัติการขาย", detail: "ตรวจย้อนหลังรายโต๊ะ", needsLogin: true },
      { to: "/admin/restore", label: "กู้คืนและ audit", detail: "กู้ข้อมูลที่ลบ และดูบันทึกการแก้ไข", needsLogin: true },
    ],
  },
];

export default function DirectoryPage() {
  const { staff } = useAuth();
  const [qrToken, setQrToken] = useState("");
  const [queueToken, setQueueToken] = useState("");
  const [lookupError, setLookupError] = useState<string | null>(null);

  // เมื่อเป็นพนักงาน RLS ยอมให้อ่าน qr_session ได้ จึงหยิบโต๊ะที่กำลังใช้งานมาให้เลย
  useEffect(() => {
    if (!staff) return;
    let active = true;

    void (async () => {
      const { data: session, error } = await supabase
        .from("qr_session")
        .select("token, visit!inner(status)")
        .is("revoked_at", null)
        .in("visit.status", ["SEATED", "DINING"])
        .limit(1)
        .maybeSingle();

      if (!active) return;
      if (error) {
        setLookupError(error.message);
        return;
      }
      if (session?.token) setQrToken(session.token);

      const { data: ticket } = await supabase
        .from("queue_ticket")
        .select("public_token")
        .in("status", ["WAITING", "CALLED"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (active && ticket?.public_token) setQueueToken(ticket.public_token);
    })();

    return () => {
      active = false;
    };
  }, [staff]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">ทุกหน้าในระบบ</h1>
        <p className="mt-1 text-sm text-ink-faint">
          หมากระทุปุ๊ป๊ะ · กดเพื่อเปิดหน้าไหนก็ได้ ไม่ต้องจำเส้นทางเอง
        </p>
      </header>

      {!staff ? (
        <Notice tone="info">
          หน้าฝั่งพนักงานและเจ้าของร้านต้องล็อกอินก่อน กดเข้าหน้าไหนก็ได้แล้วระบบจะพาไปหน้าล็อกอินให้
        </Notice>
      ) : null}

      <div className="mt-5 space-y-6">
        {GROUPS.map((group) => (
          <div key={group.title}>
            <SectionTitle>{group.title}</SectionTitle>
            <p className="mb-2 text-xs text-ink-faint">{group.note}</p>
            <Card padded={false}>
              <ul className="divide-y divide-line">
                {group.routes.map((route) => (
                  <li key={route.to}>
                    <Link
                      to={route.to}
                      className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-sunken"
                    >
                      <span>
                        <span className="flex items-center gap-2 font-semibold">
                          {route.label}
                          {route.needsLogin && !staff ? (
                            <Badge tone="neutral">ต้องล็อกอิน</Badge>
                          ) : null}
                        </span>
                        <span className="block text-xs text-ink-faint">{route.detail}</span>
                        <code className="mt-0.5 block text-[11px] text-ink-faint">
                          {route.to}
                        </code>
                      </span>
                      <span className="text-ink-faint">
                        <IconChevronRight />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        ))}

        {/* สองหน้านี้ต้องมี token จึงแยกออกมา */}
        <div>
          <SectionTitle>หน้าลูกค้าที่ต้องใช้ token</SectionTitle>
          <p className="mb-2 text-xs text-ink-faint">
            หน้าโต๊ะและหน้าคิวผูกกับมื้อของลูกค้าคนหนึ่ง จึงเปิดลอย ๆ ไม่ได้
            {staff ? " — ระบบดึง token ที่ใช้งานอยู่มาให้แล้ว" : " ล็อกอินเป็นพนักงานเพื่อให้ระบบดึง token มาให้อัตโนมัติ"}
          </p>

          {lookupError ? <Notice tone="warn">{lookupError}</Notice> : null}

          <Card className="space-y-4">
            <div>
              <p className="text-sm font-semibold">หน้าโต๊ะ (ปลายทางของ QR)</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Input
                  value={qrToken}
                  onChange={(e) => setQrToken(e.target.value)}
                  placeholder="วาง qr_token ที่นี่"
                  className="flex-1 min-w-48"
                  aria-label="qr token"
                />
                <Link to={qrToken ? `/t/${qrToken}` : "#"}>
                  <Button disabled={!qrToken}>เปิดหน้าโต๊ะ</Button>
                </Link>
                <Link to={qrToken ? `/t/${qrToken}/split` : "#"}>
                  <Button variant="outline" disabled={!qrToken}>
                    หน้าแยกบิล
                  </Button>
                </Link>
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold">หน้าดูคิวของลูกค้า</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Input
                  value={queueToken}
                  onChange={(e) => setQueueToken(e.target.value)}
                  placeholder="วาง public_token ของคิว"
                  className="flex-1 min-w-48"
                  aria-label="queue token"
                />
                <Link to={queueToken ? `/q/${queueToken}` : "#"}>
                  <Button disabled={!queueToken}>เปิดหน้าคิว</Button>
                </Link>
              </div>
              <p className="mt-1.5 text-xs text-ink-faint">
                ถ้าไม่มีคิวค้างอยู่ ให้ไปกดรับคิวที่หน้าแรกก่อน แล้วระบบจะพาไปหน้านี้เอง
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

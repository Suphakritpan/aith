import { Link } from "react-router";
import { Button, Card } from "../../design/primitives";
import { IconCheck, IconClock } from "../../design/icons";

// สถานะปลายทางของ /t/:token — ตอบ 410 จากเซิร์ฟเวอร์ (BR-02)
//
// QR ผูกกับมื้อ ไม่ใช่กับโต๊ะ ปิดโต๊ะเมื่อไหร่ token หมดอายุทันที
// หน้านี้มีไว้เพื่อสองกรณีที่ต่างกันมาก แต่เซิร์ฟเวอร์ตอบเหมือนกัน:
//   1. มื้อจบแล้วจริง ๆ — ลูกค้าเดิมเปิดลิงก์เก่าดูอีกครั้ง
//   2. ลูกค้าโต๊ะถัดไปถ่ายรูป QR ใบเก่าไว้แล้วสแกน
// ทั้งสองกรณีต้องไม่เห็นข้อมูลของใครเลย ข้อความจึงบอกทางออกโดยไม่เผยอะไรทั้งสิ้น

export default function MealEnded() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <Card className="text-center">
        <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-sunken text-ink-faint">
          <IconCheck className="size-8" />
        </span>

        <h1 className="mt-4 text-2xl font-bold">มื้อนี้จบแล้ว</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
          ลิงก์นี้ใช้ได้เฉพาะระหว่างมื้อที่เปิดอยู่ และหมดอายุทันทีที่ปิดโต๊ะ
          ขอบคุณที่มาใช้บริการ
        </p>

        <div className="mt-5 space-y-2 rounded-xl bg-sunken px-4 py-3 text-left text-sm text-ink-soft">
          <p className="flex items-start gap-2">
            <IconClock className="mt-0.5 size-4 shrink-0" />
            <span>
              ถ้ายังนั่งอยู่ที่โต๊ะและเพิ่งสแกนไม่ติด กรุณาเรียกพนักงานเพื่อขอ QR ใบใหม่
              — ใบเก่าที่ถ่ายรูปไว้จะใช้ไม่ได้อีก
            </span>
          </p>
        </div>

        <Link to="/">
          <Button block className="mt-5">
            รับคิวใหม่
          </Button>
        </Link>
        <Link to="/reserve">
          <Button variant="ghost" block className="mt-2">
            จองโต๊ะล่วงหน้าสำหรับครั้งหน้า
          </Button>
        </Link>
      </Card>
    </div>
  );
}

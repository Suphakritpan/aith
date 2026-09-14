// การแสดงผลตัวเลขและเวลา
//
// เวลาคงเหลือคำนวณในเครื่องผู้ใช้ ไม่ใช่รอค่าจากเซิร์ฟเวอร์ทุกวินาที
// เพราะนาฬิกาต้องเดินต่อเนื่องแม้เน็ตสะดุด — เซิร์ฟเวอร์ยังเป็นแหล่งความจริงของการคิดเงิน
// ตัวเลขบนหน้าจอเป็นเพียงการบอกให้ลูกค้ารู้ตัว ไม่ใช่ตัวตั้งของบิล (BR-04)
// `now` ที่ส่งเข้ามาต้องชดเชยนาฬิกาเครื่องแล้ว (ดู useNow ใน usePolling.ts) ไม่งั้นเครื่องเพี้ยน
// จะทำให้ตัวเลขที่ลูกค้าเห็นไม่ตรงกับรอบที่เซิร์ฟเวอร์คิดเงินจริง

export function formatBaht(amount: number): string {
  return new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatClock(totalMinutes: number): string {
  const safe = Math.max(0, Math.floor(totalMinutes));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return hours > 0 ? `${hours} ชม. ${minutes} นาที` : `${minutes} นาที`;
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * วันและเวลาแบบไทยเต็มรูป เช่น "15 ก.ย. 2569 18:00"
 *
 * ช่อง <input type="datetime-local"> แสดงผลตามภาษาของเครื่อง เครื่องที่ตั้งเป็นอังกฤษ
 * จะขึ้น 09/15/2026 ซึ่งคนไทยอ่านสลับวันกับเดือน แก้รูปแบบในช่องเองไม่ได้
 * จึงพิมพ์ค่าที่อ่านออกกำกับไว้ใต้ช่อง และใช้รูปแบบเดียวกันนี้บนใบยืนยันด้วย
 */
export function formatBookingDateTime(value: string | Date): string {
  const when = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(when.getTime())) return "—";
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(when);
}

/** นาทีที่ผ่านไปตั้งแต่ seated_at ปัดขึ้นเหมือน fn_calc_bill ฝั่งฐานข้อมูล */
export function elapsedMinutesSince(seatedAt: string, now = Date.now()): number {
  return Math.ceil((now - new Date(seatedAt).getTime()) / 60000);
}

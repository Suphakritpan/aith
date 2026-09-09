// การแสดงผลตัวเลขและเวลา
//
// เวลาคงเหลือคำนวณจาก seated_at ในเครื่องผู้ใช้ ไม่ใช่รอค่าจากเซิร์ฟเวอร์ทุกวินาที
// เพราะนาฬิกาต้องเดินต่อเนื่องแม้เน็ตสะดุด — เซิร์ฟเวอร์ยังเป็นแหล่งความจริงของการคิดเงิน
// ตัวเลขบนหน้าจอเป็นเพียงการบอกให้ลูกค้ารู้ตัว ไม่ใช่ตัวตั้งของบิล (BR-04)

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

/** นาทีที่ผ่านไปตั้งแต่ seated_at ปัดขึ้นเหมือน fn_calc_bill ฝั่งฐานข้อมูล */
export function elapsedMinutesSince(seatedAt: string, now = Date.now()): number {
  return Math.ceil((now - new Date(seatedAt).getTime()) / 60000);
}

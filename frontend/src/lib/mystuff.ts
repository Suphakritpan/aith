// จำคิวและการจองล่าสุดไว้ในเครื่องลูกค้า
//
// ลูกค้าไม่ได้ล็อกอิน สิ่งเดียวที่ผูกเขากับคิวคือ token ในลิงก์ ซึ่งเป็นอักษรสุ่มยาว
// ปิดแท็บทิ้งแล้วจำไม่ได้แน่นอน ที่ผ่านมาจึงกดรับคิวใบใหม่ทับใบเดิมโดยไม่มีอะไรเตือน
//
// ทางแก้ที่เบาที่สุดคือเก็บไว้ในเครื่องคนเดิม ไม่ต้องมีตารางใหม่ ไม่ต้องค้นด้วยเบอร์โทร
// การค้นด้วยเบอร์โทรอย่างเดียวจะทำให้ใครก็ตามที่เดาเบอร์ถูกเห็นคิวของคนอื่นได้
//
// ponytail: localStorage อย่างเดียว ถ้าวันหนึ่งต้องข้ามเครื่องค่อยเพิ่มการค้นฝั่งเซิร์ฟเวอร์

const TICKET_KEY = "puppa.myTicket";
const BOOKING_KEY = "puppa.myBooking";

export type SavedTicket = { token: string; ticketNo: string; savedAt: number };
export type SavedBooking = { ref: string; phone: string; reservedFor: string; partySize: number };

/** คิวหมดอายุตามวันทำการ เก็บข้ามคืนไว้ก็ไม่มีประโยชน์ */
const TICKET_TTL_MS = 12 * 60 * 60 * 1000;

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // โหมดส่วนตัวหรือพื้นที่เต็ม — จำไม่ได้ก็ไม่เป็นไร หน้าจอยังใช้ได้ตามปกติ
  }
}

function clear(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // เช่นเดียวกับ write
  }
}

export function saveTicket(token: string, ticketNo: string): void {
  write(TICKET_KEY, { token, ticketNo, savedAt: Date.now() } satisfies SavedTicket);
}

export function loadTicket(): SavedTicket | null {
  const saved = read<SavedTicket>(TICKET_KEY);
  if (!saved?.token) return null;
  if (Date.now() - saved.savedAt > TICKET_TTL_MS) {
    clear(TICKET_KEY);
    return null;
  }
  return saved;
}

export function forgetTicket(): void {
  clear(TICKET_KEY);
}

export function saveBooking(booking: SavedBooking): void {
  write(BOOKING_KEY, booking);
}

export function loadBooking(): SavedBooking | null {
  const saved = read<SavedBooking>(BOOKING_KEY);
  if (!saved?.ref) return null;
  // การจองที่เลยเวลานัดมาเกินสองชั่วโมงถือว่าจบไปแล้ว ไม่ต้องค้างหน้าแรก
  if (Date.parse(saved.reservedFor) + 2 * 60 * 60 * 1000 < Date.now()) {
    clear(BOOKING_KEY);
    return null;
  }
  return saved;
}

export function forgetBooking(): void {
  clear(BOOKING_KEY);
}

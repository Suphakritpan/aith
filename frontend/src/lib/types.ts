// รูปร่างข้อมูลที่ Edge Function `api` ตอบกลับ
//
// ชนิดเหล่านี้เขียนจากคำตอบจริงของ endpoint ที่ deploy อยู่ ไม่ได้เดาจากสเปค
// ที่ใดยังไม่แน่ใจจะมีคอมเมนต์กำกับไว้ และเขียนให้ทนต่อฟิลด์ที่หายไปได้

export type StaffRole = "STAFF" | "SUPERVISOR" | "OWNER";

export type TableStatus = "AVAILABLE" | "OCCUPIED" | "CLEANING" | "RESERVED";

export type PaxTier = "ADULT" | "CHILD" | "TODDLER_FREE";

export type VisitStatus =
  | "QUEUED"
  | "SEATED"
  | "DINING"
  | "BILL_REQUESTED"
  | "PAID"
  | "CLOSED"
  | "VOIDED";

export type OrderItemStatus = "PENDING" | "PREPARING" | "SERVED" | "CANCELLED";

export type ServiceCallType = "WATER" | "UTENSIL" | "BILL" | "TIME_WARNING" | "OTHER";

export type QueueLane = "A" | "B" | "C";

/** GET /queue/tickets/:publicToken */
export type QueueTicketView = {
  ticket_no: string;
  party_size: number;
  status: "WAITING" | "CALLED" | "SEATED" | "NO_SHOW" | "CANCELLED";
  ahead: number;
  estimated_wait_minutes: number | null;
  /** เลขที่ร้านกำลังเรียกอยู่ในช่องเดียวกัน — ให้ลูกค้าเทียบได้ว่าคิวเดินถึงไหน */
  now_calling: string | null;
  /** มีค่าเมื่อพนักงานเปิดโต๊ะให้แล้ว — ใช้พาลูกค้าไปหน้าโต๊ะต่อทันที */
  qr_token: string | null;
};

/** POST /queue/tickets */
export type QueueTicketCreated = {
  ticket_no?: string;
  public_token?: string;
  lane?: QueueLane;
  party_size?: number;
  estimated_wait_minutes?: number | null;
} & Record<string, unknown>;

/** GET /queue/board */
export type QueueBoardView = {
  tickets: {
    ticket_no: string;
    lane: QueueLane;
    party_size: number;
    status: string;
    call_count?: number;
    last_called_at?: string | null;
  }[];
};

export type MenuCategory = {
  category_id: string;
  name: string;
  items: { menu_item_id: string; name: string }[];
};

export type BillEstimate = {
  package_subtotal: number;
  addon_subtotal: number;
  overtime_rounds: number;
  overtime_subtotal: number;
  net_total: number;
};

export type Bill = {
  bill_id: string;
  visit_id: string;
  package_subtotal: number;
  addon_subtotal: number;
  overtime_rounds: number;
  overtime_subtotal: number;
  discount_amount: number;
  net_total: number;
  split_mode: "EQUAL_PER_HEAD" | "CUSTOM_AMOUNT";
  issued_at: string;
};

/**
 * หนึ่งรอบที่กดสั่ง — โครงสร้างภายในของ `items` ยังไม่ได้ยืนยันกับ endpoint จริง
 * เพราะตอนสำรวจยังไม่มีออเดอร์ในระบบ จึงเขียนให้ฟิลด์ทั้งหมดเป็น optional
 * และหน้าจอต้องรับมือได้เมื่อบางฟิลด์หายไป
 */
export type OrderBatch = {
  order_batch_id: string;
  created_at: string;
  source?: "CUSTOMER" | "STAFF";
  items?: {
    order_item_id: string;
    qty: number;
    status: OrderItemStatus;
    name?: string;
    menu_item?: { name?: string } | null;
  }[];
};

/** GET /c/:qrToken — ทุกอย่างที่หน้าโต๊ะต้องใช้ในคำขอเดียว */
export type VisitView = {
  visit: {
    visit_id: string;
    branch_id: string;
    status: VisitStatus;
    seated_at: string;
    duration_minutes: number;
    elapsed_minutes: number;
    remaining_minutes: number;
    is_time_warning: boolean;
    is_overtime: boolean;
    paying_pax: number;
    lane: QueueLane | null;
    seq_no: number | null;
    table_nos: string | null;
    open_item_count: number;
    open_call_count: number;
    first_order_at: string | null;
    bill_requested_at: string | null;
    paid_at: string | null;
    closed_at: string | null;
  };
  pax: { tier: PaxTier; qty: number; unit_price: number }[];
  addons: { addon_id: string; qty: number; unit_price: number; name?: string }[];
  batches: OrderBatch[];
  bill: Bill | null;
  estimate: BillEstimate;
  service_calls: {
    service_call_id: string;
    type: ServiceCallType;
    status: "OPEN" | "ACCEPTED" | "DONE";
    created_at: string;
  }[];
  menu: MenuCategory[];
};

export const TIER_LABEL: Record<PaxTier, string> = {
  ADULT: "ผู้ใหญ่",
  CHILD: "เด็ก",
  TODDLER_FREE: "เด็กเล็ก (ฟรี)",
};

export const ORDER_STATUS_LABEL: Record<OrderItemStatus, string> = {
  PENDING: "รอครัวรับ",
  PREPARING: "กำลังเตรียม",
  SERVED: "เสิร์ฟแล้ว",
  CANCELLED: "ยกเลิก",
};

export const ROLE_LABEL: Record<StaffRole, string> = {
  STAFF: "พนักงาน",
  SUPERVISOR: "หัวหน้ากะ",
  OWNER: "เจ้าของร้าน",
};

export const TABLE_STATUS_LABEL: Record<TableStatus, string> = {
  AVAILABLE: "ว่าง",
  OCCUPIED: "มีลูกค้า",
  CLEANING: "รอเก็บโต๊ะ",
  RESERVED: "จองไว้",
};

export const VISIT_STATUS_LABEL: Record<VisitStatus, string> = {
  QUEUED: "รอคิว",
  SEATED: "นั่งแล้ว",
  DINING: "กำลังกิน",
  BILL_REQUESTED: "ขอเช็กบิล",
  PAID: "จ่ายแล้ว",
  CLOSED: "ปิดโต๊ะ",
  VOIDED: "ยกเลิก",
};

/** แถวจาก view v_visit_live — ใช้ทั้งแดชบอร์ดและผังโต๊ะ */
export type VisitLive = {
  visit_id: string;
  branch_id: string;
  status: VisitStatus;
  seated_at: string;
  duration_minutes: number;
  elapsed_minutes: number;
  remaining_minutes: number;
  is_time_warning: boolean;
  is_overtime: boolean;
  paying_pax: number;
  lane: QueueLane | null;
  seq_no: number | null;
  table_nos: string | null;
  open_item_count: number;
  open_call_count: number;
};

export type DiningTable = {
  table_id: string;
  table_no: string;
  seat_capacity: number;
  status: TableStatus;
  zone_id: string | null;
};

export type QueueTicketRow = {
  queue_ticket_id: string;
  lane: QueueLane;
  seq_no: number;
  party_size: number;
  status: "WAITING" | "CALLED" | "SEATED" | "NO_SHOW" | "CANCELLED";
  phone: string | null;
  created_at: string;
  public_token: string;
};

export type KitchenItem = {
  order_item_id: string;
  status: OrderItemStatus;
  qty: number;
  menu_name: string;
  order_batch_id: string;
  ordered_at: string;
  visit_id: string;
  table_nos: string | null;
};

export const SERVICE_CALL_LABEL: Record<ServiceCallType, string> = {
  WATER: "ขอน้ำ",
  UTENSIL: "ขออุปกรณ์",
  BILL: "ขอเช็กบิล",
  TIME_WARNING: "แจ้งเตือนเวลา",
  OTHER: "เรียกพนักงาน",
};

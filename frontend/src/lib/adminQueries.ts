import { supabase } from "./supabase";

// คำสั่งฝั่งหลังร้าน
//
// RLS จำกัดไว้แล้วว่าเมนูและราคาแก้ได้เฉพาะบทบาทที่กำหนด และ audit log อ่านได้เฉพาะเจ้าของร้าน
// หน้าจอจึงซ่อนปุ่มตามบทบาทเพื่อความสะดวก แต่ไม่ได้พึ่งการซ่อนนั้นเป็นการรักษาความปลอดภัย

export type DailyReport = {
  service_date: string;
  sales: {
    visit_count?: number;
    guest_count?: number;
    gross_sales?: number;
    avg_turn_minutes?: number;
    overtime_rounds?: number;
  };
  top_menu: { menu_name: string; ordered_qty: number }[];
  busy_hours: { hour: number; visits: number }[];
};

export async function fetchDailyReport(
  branchId: string,
  date: string,
): Promise<DailyReport> {
  const { data, error } = await supabase.rpc("fn_daily_report", {
    p_branch_id: branchId,
    p_date: date,
  });
  if (error) throw new Error(error.message);
  return data as DailyReport;
}

export type MenuRow = {
  menu_item_id: string;
  name: string;
  is_available: boolean;
  sort_order: number;
  category_id: string;
  menu_category: { name: string } | null;
};

export async function fetchMenu(): Promise<MenuRow[]> {
  const { data, error } = await supabase
    .from("menu_item")
    .select("menu_item_id, name, is_available, sort_order, category_id, menu_category(name)")
    .is("deleted_at", null)
    .order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as MenuRow[];
}

/** เปิด-ปิดเมนูของหมด (86 list) — ผลจะถึงหน้าลูกค้าในรอบ polling ถัดไป */
export async function setMenuAvailability(menuItemId: string, available: boolean) {
  const { error } = await supabase
    .from("menu_item")
    .update({ is_available: available })
    .eq("menu_item_id", menuItemId);
  if (error) throw new Error(error.message);
}

export async function fetchPackagePrices() {
  const { data, error } = await supabase
    .from("package_price")
    .select("package_price_id, tier, price, effective_from, package(name)")
    .order("effective_from", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as {
    package_price_id: string;
    tier: string;
    price: number;
    effective_from: string;
    package: { name: string } | null;
  }[];
}

export async function fetchAuditLog(table?: string) {
  let query = supabase
    .from("audit_log")
    .select("audit_id, table_name, record_id, action, created_at, staff(full_name)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (table) query = query.eq("table_name", table);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as {
    audit_id: string;
    table_name: string;
    record_id: string;
    action: string;
    created_at: string;
    staff: { full_name: string } | null;
  }[];
}

/** รายการที่ถูก soft delete — หน้ากู้คืนอ่านจากที่นี่ (BR-10) */
export async function fetchDeleted(table: "visit" | "menu_item" | "dining_table") {
  const { data, error } = await supabase
    .from(table)
    .select("*")
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []) as Record<string, unknown>[];
}

export async function restoreRecord(table: string, recordId: string) {
  const { error } = await supabase.rpc("fn_restore_record", {
    p_table_name: table,
    p_record_id: recordId,
  });
  if (error) throw new Error(error.message);
}

export async function fetchRecentVisits(limit = 30) {
  const { data, error } = await supabase
    .from("visit")
    .select("visit_id, status, seated_at, closed_at, duration_minutes, bill(net_total)")
    .is("deleted_at", null)
    .order("seated_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as {
    visit_id: string;
    status: string;
    seated_at: string;
    closed_at: string | null;
    duration_minutes: number;
    bill: { net_total: number } | null;
  }[];
}

/* ── พนักงานและบทบาท ──────────────────────────────────────────────────────── */

export type StaffDirectoryRow = {
  staff_id: string;
  full_name: string;
  role: "STAFF" | "SUPERVISOR" | "OWNER";
  is_active: boolean;
  linked_to_auth: boolean;
  has_pin: boolean;
  created_at: string;
};

export async function fetchStaffDirectory(): Promise<StaffDirectoryRow[]> {
  const { data, error } = await supabase
    .from("v_staff_directory")
    .select("staff_id, full_name, role, is_active, linked_to_auth, has_pin, created_at")
    .order("role", { ascending: false })
    .order("full_name");
  if (error) throw new Error(error.message);
  return (data ?? []) as StaffDirectoryRow[];
}

export async function setStaffRole(
  staffId: string,
  role: "STAFF" | "SUPERVISOR" | "OWNER",
) {
  const { error } = await supabase.from("staff").update({ role }).eq("staff_id", staffId);
  if (error) throw new Error(error.message);
}

export async function setStaffActive(staffId: string, isActive: boolean) {
  const { error } = await supabase
    .from("staff")
    .update({ is_active: isActive })
    .eq("staff_id", staffId);
  if (error) throw new Error(error.message);
}

/** ตั้ง PIN ผ่านฐานข้อมูล — ค่าที่พิมพ์ไม่เคยถูกเก็บเป็น plain text ที่ไหนเลย */
export async function setStaffPin(staffId: string, pin: string) {
  const { error } = await supabase.rpc("fn_set_pin", { p_staff_id: staffId, p_pin: pin });
  if (error) throw new Error(error.message);
}

export async function clearStaffPin(staffId: string) {
  const { error } = await supabase.rpc("fn_clear_pin", { p_staff_id: staffId });
  if (error) throw new Error(error.message);
}

/* ── โซนและโต๊ะ ───────────────────────────────────────────────────────────── */

export type ZoneRow = { zone_id: string; name: string; sort_order: number };

export async function fetchZones(): Promise<ZoneRow[]> {
  const { data, error } = await supabase
    .from("zone")
    .select("zone_id, name, sort_order")
    .is("deleted_at", null)
    .order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []) as ZoneRow[];
}

export async function updateTable(
  tableId: string,
  patch: { table_no?: string; seat_capacity?: number; zone_id?: string | null },
) {
  const { error } = await supabase.from("dining_table").update(patch).eq("table_id", tableId);
  if (error) throw new Error(error.message);
}

export async function createTable(input: {
  branchId: string;
  tableNo: string;
  seats: number;
  zoneId: string | null;
}) {
  const { error } = await supabase.from("dining_table").insert({
    branch_id: input.branchId,
    table_no: input.tableNo,
    seat_capacity: input.seats,
    zone_id: input.zoneId,
  });
  if (error) throw new Error(error.message);
}

export async function softDeleteTable(tableId: string) {
  const { error } = await supabase
    .from("dining_table")
    .update({ deleted_at: new Date().toISOString() })
    .eq("table_id", tableId);
  if (error) throw new Error(error.message);
}

/* ── แพ็กเกจ ราคา และรายการเสริม ──────────────────────────────────────────── */

export async function fetchPackages() {
  const { data, error } = await supabase
    .from("package")
    .select("package_id, name, duration_minutes, is_active")
    .is("deleted_at", null)
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as {
    package_id: string;
    name: string;
    duration_minutes: number;
    is_active: boolean;
  }[];
}

/**
 * ขึ้นราคาด้วยการเพิ่มแถวใหม่ที่มีวันเริ่มใช้ ไม่ใช่แก้ทับของเดิม
 *
 * บิลเก่าอ้างราคาที่ snapshot ไว้ใน visit_pax อยู่แล้ว แต่การเก็บประวัติราคาไว้
 * ทำให้ตรวจย้อนหลังได้ว่าวันนั้นร้านตั้งราคาเท่าไร ซึ่งเป็นคนละเรื่องกัน
 */
export async function addPackagePrice(input: {
  packageId: string;
  tier: "ADULT" | "CHILD" | "TODDLER_FREE";
  price: number;
  effectiveFrom: string;
}) {
  const { error } = await supabase.from("package_price").insert({
    package_id: input.packageId,
    tier: input.tier,
    price: input.price,
    effective_from: input.effectiveFrom,
  });
  if (error) throw new Error(error.message);
}

export async function updatePackageDuration(packageId: string, minutes: number) {
  const { error } = await supabase
    .from("package")
    .update({ duration_minutes: minutes })
    .eq("package_id", packageId);
  if (error) throw new Error(error.message);
}

export async function fetchAddons() {
  const { data, error } = await supabase
    .from("addon")
    .select("addon_id, name, price, charge_basis, is_active")
    .is("deleted_at", null)
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as {
    addon_id: string;
    name: string;
    price: number;
    charge_basis: string;
    is_active: boolean;
  }[];
}

export async function updateAddon(
  addonId: string,
  patch: { price?: number; is_active?: boolean; name?: string },
) {
  const { error } = await supabase.from("addon").update(patch).eq("addon_id", addonId);
  if (error) throw new Error(error.message);
}

/* ── สต๊อก ────────────────────────────────────────────────────────────────── */

export type InventoryRow = { inventory_item_id: string; name: string; unit: string };

export async function fetchInventory(): Promise<InventoryRow[]> {
  const { data, error } = await supabase
    .from("inventory_item")
    .select("inventory_item_id, name, unit")
    .is("deleted_at", null)
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as InventoryRow[];
}

export type StockCountRow = {
  stock_count_id: string;
  inventory_item_id: string;
  count_date: string;
  opening_qty: number;
  closing_qty: number;
  waste_qty: number;
  note: string | null;
};

export async function fetchStockCounts(date: string): Promise<StockCountRow[]> {
  const { data, error } = await supabase
    .from("stock_count")
    .select("stock_count_id, inventory_item_id, count_date, opening_qty, closing_qty, waste_qty, note")
    .eq("count_date", date)
    .is("deleted_at", null);
  if (error) throw new Error(error.message);
  return (data ?? []) as StockCountRow[];
}

/** นับสต๊อกรายวัน ไม่ตัดสต๊อกอัตโนมัติจากออเดอร์ (ADR-09) */
export async function saveStockCount(input: {
  inventoryItemId: string;
  date: string;
  opening: number;
  closing: number;
  waste: number;
  note: string | null;
  staffId: string;
}) {
  const { error } = await supabase.from("stock_count").upsert(
    {
      inventory_item_id: input.inventoryItemId,
      count_date: input.date,
      opening_qty: input.opening,
      closing_qty: input.closing,
      waste_qty: input.waste,
      note: input.note,
      counted_by: input.staffId,
    },
    { onConflict: "inventory_item_id,count_date" },
  );
  if (error) throw new Error(error.message);
}

export async function createInventoryItem(branchId: string, name: string, unit: string) {
  const { error } = await supabase
    .from("inventory_item")
    .insert({ branch_id: branchId, name, unit });
  if (error) throw new Error(error.message);
}

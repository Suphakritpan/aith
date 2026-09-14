import { useCallback, useMemo, useState } from "react";
import { usePolling } from "../../lib/usePolling";
import {
  fetchMenu,
  fetchPackagePrices,
  setMenuAvailability,
} from "../../lib/adminQueries";
import { useAuth } from "../../lib/auth";
import { useToast } from "../../design/toast";
import { Badge, Card, Input, SectionTitle, Spinner } from "../../design/primitives";
import { IconSearch } from "../../design/icons";
import { TIER_LABEL, type PaxTier } from "../../lib/types";
import { formatBaht } from "../../lib/format";
import { AdminPage } from "./AdminShell";

// เมนูและราคา
//
// งานที่ทำบ่อยที่สุดคือการปิดเมนูที่ของหมดระหว่างวัน (86 list) ไม่ใช่การแก้ชื่อหรือเพิ่มเมนู
// สวิตช์เปิด-ปิดจึงอยู่หน้าสุดและกดได้ทันทีโดยไม่ต้องเข้าหน้าแก้ไข
// ส่วนราคาเป็นข้อมูลที่เปลี่ยนนาน ๆ ครั้งและมีผลกับบิล จึงแสดงอย่างเดียวที่นี่

export default function MenuPage() {
  const { atLeast } = useAuth();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const canEdit = atLeast("SUPERVISOR");

  const fetcher = useCallback(async () => {
    const [menu, prices] = await Promise.all([fetchMenu(), fetchPackagePrices()]);
    return { menu, prices };
  }, []);

  const { data, loading, refresh } = usePolling(fetcher, 30_000);

  const grouped = useMemo(() => {
    if (!data) return [];
    const term = search.trim().toLowerCase();
    const rows = term
      ? data.menu.filter((m) => m.name.toLowerCase().includes(term))
      : data.menu;

    const byCategory = new Map<string, typeof rows>();
    for (const row of rows) {
      const key = row.menu_category?.name ?? "ไม่มีหมวด";
      byCategory.set(key, [...(byCategory.get(key) ?? []), row]);
    }
    return [...byCategory.entries()];
  }, [data, search]);

  async function toggle(id: string, name: string, next: boolean) {
    try {
      await setMenuAvailability(id, next);
      toast.show(next ? `เปิดขาย ${name} แล้ว` : `ปิด ${name} (ของหมด)`);
      refresh();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "แก้ไขไม่สำเร็จ", "error");
    }
  }

  if (loading && !data) return <Spinner label="กำลังโหลดเมนู" />;
  if (!data) return null;

  const unavailable = data.menu.filter((m) => !m.is_available).length;

  return (
    <AdminPage
      title="เมนูและราคา"
      subtitle={`ทั้งหมด ${data.menu.length} รายการ · ปิดอยู่ ${unavailable} รายการ`}
      action={
        <div className="relative">
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-faint">
            <IconSearch className="size-4" />
          </span>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาเมนู"
            className="w-56 pl-9"
            aria-label="ค้นหาเมนู"
          />
        </div>
      }
    >
      <Card className="mb-4">
        <SectionTitle>ราคาต่อหัว</SectionTitle>
        <div className="grid gap-2 sm:grid-cols-3">
          {data.prices.slice(0, 3).map((price) => (
            <div key={price.package_price_id} className="rounded-xl bg-sunken px-3 py-2">
              <p className="text-xs text-ink-faint">
                {TIER_LABEL[price.tier as PaxTier] ?? price.tier}
              </p>
              <p className="tabular text-xl font-bold">{formatBaht(price.price)} ฿</p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink-faint">
          การขึ้นราคาต้องเพิ่มแถวใหม่ที่มีวันเริ่มใช้ ไม่ทับของเดิม
          เพื่อให้บิลเก่ายังคิดด้วยราคาที่ลูกค้าเห็นตอนนั้น
        </p>
      </Card>

      {grouped.length === 0 ? (
        <p className="py-10 text-center text-sm text-ink-faint">ไม่พบเมนูที่ค้นหา</p>
      ) : (
        <div className="space-y-4">
          {grouped.map(([category, items]) => (
            <Card key={category} padded={false}>
              <h2 className="border-b border-line px-4 py-3 font-bold">{category}</h2>
              <ul className="divide-y divide-line">
                {items.map((item) => (
                  <li
                    key={item.menu_item_id}
                    className="flex items-center justify-between gap-3 px-4 py-3"
                  >
                    <span className="flex items-center gap-2">
                      {item.name}
                      {!item.is_available ? <Badge tone="warn">ของหมด</Badge> : null}
                    </span>

                    <label className="inline-flex cursor-pointer items-center gap-2">
                      <span className="text-xs text-ink-faint">
                        {item.is_available ? "เปิดขาย" : "ปิด"}
                      </span>
                      <input
                        type="checkbox"
                        className="peer sr-only"
                        checked={item.is_available}
                        disabled={!canEdit}
                        onChange={(e) =>
                          void toggle(item.menu_item_id, item.name, e.target.checked)
                        }
                      />
                      <span className="relative h-7 w-12 rounded-full bg-line-strong transition-colors peer-checked:bg-ok-500 peer-disabled:opacity-40">
                        <span className="absolute top-1 left-1 size-5 rounded-full bg-white transition-transform peer-checked:translate-x-5" />
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}

      {!canEdit ? (
        <p className="mt-4 text-xs text-ink-faint">
          บัญชีนี้ดูได้อย่างเดียว การแก้เมนูต้องเป็นหัวหน้ากะขึ้นไป
        </p>
      ) : null}
    </AdminPage>
  );
}

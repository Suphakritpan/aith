import { useState } from "react";
import { api, ApiError, newIdempotencyKey } from "../../lib/api";
import type { MenuCategory, VisitView } from "../../lib/types";
import { Button, Card, Notice } from "../../design/primitives";

// §04 ขั้นที่ 06 — ทุกคนในโต๊ะสั่งพร้อมกันจากมือถือตัวเอง สั่งได้หลายรอบ
//
// เมนูไม่มีราคาโดยเจตนา (ADR-02) ร้านคิดเงินต่อหัว การโชว์ราคาต่อจานจะทำให้ลูกค้าเข้าใจผิด
// ว่าต้องจ่ายเพิ่ม ตะกร้าจึงนับแค่ "จำนวนที่จะสั่ง" ไม่มียอดเงินให้ดู

type Props = {
  token: string;
  menu: MenuCategory[];
  addons: VisitView["addons"];
  payingPax: number;
  disabled: boolean;
  onDone: () => void;
};

export default function MenuTab({
  token,
  menu,
  addons,
  payingPax,
  disabled,
  onDone,
}: Props) {
  const [cart, setCart] = useState<Record<string, number>>({});
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const totalItems = Object.values(cart).reduce((sum, n) => sum + n, 0);
  const chosenAddonQty = addons.reduce((sum, a) => sum + a.qty, 0);

  function bump(id: string, delta: number) {
    setCart((prev) => {
      const next = Math.max(0, (prev[id] ?? 0) + delta);
      // จำนวนศูนย์ไม่ต้องเก็บไว้ในตะกร้า จะได้นับรายการได้ตรง
      if (next === 0) {
        const { [id]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [id]: next };
    });
  }

  async function submitOrder() {
    setSending(true);
    setError(null);
    try {
      const items = Object.entries(cart).map(([menu_item_id, qty]) => ({ menu_item_id, qty }));
      // คีย์ใหม่ต่อการกดสั่งหนึ่งครั้ง กดซ้ำระหว่างรอจะได้ออเดอร์เดิม ไม่ใช่ออเดอร์ที่สอง
      await api.placeOrder(token, items, newIdempotencyKey());
      setCart({});
      setFlash("ส่งออเดอร์ให้ครัวแล้ว");
      onDone();
      window.setTimeout(() => setFlash(null), 3000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "ส่งออเดอร์ไม่สำเร็จ");
    } finally {
      setSending(false);
    }
  }

  async function setAddonQty(qty: number) {
    setError(null);
    try {
      await api.setAddon(token, qty, newIdempotencyKey());
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "บันทึกรายการเสริมไม่สำเร็จ");
    }
  }

  return (
    <>
      {error ? <Notice tone="brand">{error}</Notice> : null}
      {flash ? <Notice tone="info">{flash}</Notice> : null}

      {disabled ? (
        <Notice tone="warn">ขอเช็กบิลแล้ว สั่งอาหารเพิ่มไม่ได้</Notice>
      ) : null}

      <Card>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">น้ำดื่มรีฟิลไม่อั้น</p>
            <p className="mt-1 text-xs text-ink-faint">
              39 บาทต่อคน เลือกเฉพาะคนที่ต้องการ · คิดครั้งเดียวตลอดมื้อ
            </p>
          </div>
          <p className="tabular text-2xl font-bold">{chosenAddonQty}</p>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {Array.from({ length: payingPax + 1 }, (_, n) => n).map((n) => (
            <button
              key={n}
              type="button"
              disabled={disabled}
              onClick={() => void setAddonQty(n)}
              aria-pressed={chosenAddonQty === n}
              className={`tabular min-h-10 min-w-10 rounded-lg border px-3 text-sm font-semibold disabled:opacity-50 ${
                chosenAddonQty === n
                  ? "border-brand-500 bg-brand-500 text-white"
                  : "border-line bg-surface"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </Card>

      {menu.map((category) => (
        <Card key={category.category_id}>
          <p className="text-sm font-semibold">{category.name}</p>
          <ul className="mt-2 divide-y divide-line">
            {category.items.map((item) => {
              const qty = cart[item.menu_item_id] ?? 0;
              return (
                <li
                  key={item.menu_item_id}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <span className="text-[15px]">{item.name}</span>
                  <span className="flex items-center gap-2">
                    {qty > 0 ? (
                      <>
                        <button
                          type="button"
                          onClick={() => bump(item.menu_item_id, -1)}
                          aria-label={`ลด ${item.name}`}
                          className="size-9 rounded-lg border border-line text-lg font-bold"
                        >
                          −
                        </button>
                        <span className="tabular w-5 text-center font-semibold">{qty}</span>
                      </>
                    ) : null}
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => bump(item.menu_item_id, 1)}
                      aria-label={`เพิ่ม ${item.name}`}
                      className="size-9 rounded-lg bg-brand-500 text-lg font-bold text-white disabled:opacity-40"
                    >
                      +
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      ))}

      {totalItems > 0 ? (
        <div className="sticky bottom-20 z-10">
          <Button size="lg" block onClick={submitOrder} disabled={sending || disabled}>
            {sending ? "กำลังส่ง…" : `ส่งออเดอร์ ${totalItems} รายการ`}
          </Button>
        </div>
      ) : null}
    </>
  );
}

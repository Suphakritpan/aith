import { useCallback, useState } from "react";
import { usePolling } from "../../lib/usePolling";
import {
  createInventoryItem,
  fetchInventory,
  fetchStockCounts,
  saveStockCount,
} from "../../lib/adminQueries";
import { useAuth } from "../../lib/auth";
import { useToast } from "../../design/toast";
import { Overlay } from "../../design/overlay";
import {
  Button,
  Card,
  Field,
  Input,
  Notice,
  Spinner,
} from "../../design/primitives";
import { IconPlus } from "../../design/icons";
import { AdminPage } from "./AdminShell";

// นับสต๊อกรายวัน — ADR-09
//
// ร้านบุฟเฟต์ตักเอง วัดปริมาณจริงต่อจานไม่ได้ การตัดสต๊อกอัตโนมัติจากสูตรอาหาร
// จะให้ตัวเลขที่ดูแม่นแต่ผิด ซึ่งแย่กว่าการไม่มีตัวเลข ระบบจึงใช้การนับมือวันละครั้ง
//
// ช่องของเสียแยกจากยอดปลาย เพราะสองอย่างนี้บอกคนละเรื่อง
// ยอดปลายบอกว่าเหลือเท่าไร ของเสียบอกว่าจัดการวัตถุดิบได้ดีแค่ไหน

export default function StockPage() {
  const { staff } = useAuth();
  const toast = useToast();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Record<string, { o: string; c: string; w: string }>>({});

  const fetcher = useCallback(async () => {
    const [items, counts] = await Promise.all([fetchInventory(), fetchStockCounts(date)]);
    return { items, counts };
  }, [date]);

  const { data, loading, refresh } = usePolling(fetcher, 60_000);

  function valueFor(itemId: string, field: "o" | "c" | "w"): string {
    const local = draft[itemId]?.[field];
    if (local !== undefined) return local;

    const saved = data?.counts.find((c) => c.inventory_item_id === itemId);
    if (!saved) return "";
    const map = { o: saved.opening_qty, c: saved.closing_qty, w: saved.waste_qty };
    return String(map[field]);
  }

  function setValue(itemId: string, field: "o" | "c" | "w", next: string) {
    setDraft((prev) => ({
      ...prev,
      [itemId]: {
        o: prev[itemId]?.o ?? valueFor(itemId, "o"),
        c: prev[itemId]?.c ?? valueFor(itemId, "c"),
        w: prev[itemId]?.w ?? valueFor(itemId, "w"),
        [field]: next,
      },
    }));
  }

  async function save(itemId: string, name: string) {
    if (!staff) return;
    try {
      await saveStockCount({
        inventoryItemId: itemId,
        date,
        opening: Number(valueFor(itemId, "o") || 0),
        closing: Number(valueFor(itemId, "c") || 0),
        waste: Number(valueFor(itemId, "w") || 0),
        note: null,
        staffId: staff.staff_id,
      });
      toast.show(`บันทึก ${name} แล้ว`);
      setDraft((prev) => {
        const { [itemId]: _saved, ...rest } = prev;
        return rest;
      });
      refresh();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ", "error");
    }
  }

  if (loading && !data) return <Spinner label="กำลังโหลดสต๊อก" />;
  if (!data) return null;

  const totalWaste = data.counts.reduce((sum, c) => sum + Number(c.waste_qty), 0);
  const counted = data.counts.length;

  return (
    <AdminPage
      title="นับสต๊อกรายวัน"
      subtitle={`นับแล้ว ${counted} / ${data.items.length} รายการ · ของเสียรวม ${totalWaste}`}
      action={
        <div className="flex gap-2">
          <Input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setDraft({});
            }}
            className="w-auto"
            aria-label="วันที่นับ"
          />
          <Button icon={<IconPlus />} onClick={() => setAdding(true)}>
            เพิ่มวัตถุดิบ
          </Button>
        </div>
      }
    >
      <Notice tone="neutral">
        ระบบไม่ตัดสต๊อกอัตโนมัติจากออเดอร์ เพราะบุฟเฟต์ตักเองวัดต่อจานไม่ได้
        ตัวเลขที่นี่มาจากการนับมือเท่านั้น
      </Notice>

      {data.items.length === 0 ? (
        <Card className="mt-4 text-center">
          <p className="font-semibold">ยังไม่มีวัตถุดิบในระบบ</p>
          <p className="mt-1 text-sm text-ink-faint">กดเพิ่มวัตถุดิบเพื่อเริ่มนับ</p>
        </Card>
      ) : (
        <Card padded={false} className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="border-b border-line text-left text-xs text-ink-faint">
              <tr>
                <th className="px-4 py-3 font-semibold">วัตถุดิบ</th>
                <th className="px-4 py-3 font-semibold">ยอดต้นวัน</th>
                <th className="px-4 py-3 font-semibold">ยอดปลายวัน</th>
                <th className="px-4 py-3 font-semibold">ของเสีย</th>
                <th className="px-4 py-3 font-semibold">ใช้ไป</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.items.map((item) => {
                const opening = Number(valueFor(item.inventory_item_id, "o") || 0);
                const closing = Number(valueFor(item.inventory_item_id, "c") || 0);
                const waste = Number(valueFor(item.inventory_item_id, "w") || 0);
                // ใช้ไป = ต้นวัน − ปลายวัน − ของเสีย ซึ่งเป็นตัวเลขที่เอาไปเทียบกับยอดขายได้
                const used = opening - closing - waste;
                const dirty = draft[item.inventory_item_id] !== undefined;

                return (
                  <tr key={item.inventory_item_id}>
                    <td className="px-4 py-2.5">
                      <p className="font-semibold">{item.name}</p>
                      <p className="text-xs text-ink-faint">{item.unit}</p>
                    </td>
                    {(["o", "c", "w"] as const).map((field) => (
                      <td key={field} className="px-2 py-2">
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          className="min-h-10 w-24 text-sm"
                          aria-label={`${item.name} ${field}`}
                          value={valueFor(item.inventory_item_id, field)}
                          onChange={(e) =>
                            setValue(item.inventory_item_id, field, e.target.value)
                          }
                        />
                      </td>
                    ))}
                    <td
                      className={`tabular px-4 py-2.5 font-semibold ${used < 0 ? "text-brand-600" : ""}`}
                    >
                      {used.toFixed(2)}
                      {used < 0 ? (
                        <span className="ml-1 text-xs font-normal">ตัวเลขไม่สมเหตุผล</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Button
                        size="sm"
                        variant={dirty ? "primary" : "outline"}
                        onClick={() => void save(item.inventory_item_id, item.name)}
                      >
                        {dirty ? "บันทึก" : "บันทึกซ้ำ"}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <AddItemDialog
        open={adding}
        onClose={() => setAdding(false)}
        onSubmit={async (name, unit) => {
          if (!staff) return;
          try {
            await createInventoryItem(staff.branch_id, name, unit);
            toast.show(`เพิ่ม ${name} แล้ว`);
            setAdding(false);
            refresh();
          } catch (err) {
            toast.show(err instanceof Error ? err.message : "เพิ่มไม่สำเร็จ", "error");
          }
        }}
      />
    </AdminPage>
  );
}

function AddItemDialog({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (name: string, unit: string) => void;
}) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("กก.");

  return (
    <Overlay
      open={open}
      onClose={onClose}
      title="เพิ่มวัตถุดิบ"
      footer={
        <Button
          block
          size="lg"
          disabled={name.trim().length === 0}
          onClick={() => {
            onSubmit(name.trim(), unit.trim());
            setName("");
          }}
        >
          เพิ่ม
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="ชื่อวัตถุดิบ" htmlFor="item_name">
          <Input
            id="item_name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="เช่น หมูสไลซ์"
          />
        </Field>
        <Field label="หน่วยนับ" htmlFor="item_unit" hint="เช่น กก., ถาด, ขวด">
          <Input id="item_unit" value={unit} onChange={(e) => setUnit(e.target.value)} />
        </Field>
      </div>
    </Overlay>
  );
}

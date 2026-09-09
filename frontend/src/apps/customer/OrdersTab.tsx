import type { OrderBatch, OrderItemStatus } from "../../lib/types";
import { ORDER_STATUS_LABEL } from "../../lib/types";
import { Badge, Card } from "../../components/ui";
import { formatTime } from "../../lib/format";

// §04 ขั้นที่ 08 — ลูกค้าเห็นสถานะอาหารเรียลไทม์ว่าครัวรับแล้วหรือยัง
// สถานะอยู่ระดับรายการ ไม่ใช่ระดับรอบ เพราะของในหนึ่งรอบเสิร์ฟไม่พร้อมกัน

const TONE: Record<OrderItemStatus, "neutral" | "brand" | "done" | "warn"> = {
  PENDING: "neutral",
  PREPARING: "brand",
  SERVED: "done",
  CANCELLED: "warn",
};

export default function OrdersTab({ batches }: { batches: OrderBatch[] }) {
  if (batches.length === 0) {
    return (
      <Card className="text-center">
        <p className="text-sm text-muted-strong">ยังไม่ได้สั่งอะไรเลย</p>
        <p className="mt-1 text-xs text-muted">เลือกจากแท็บเมนูได้เลย สั่งกี่รอบก็ได้</p>
      </Card>
    );
  }

  return (
    <>
      {batches.map((batch, index) => (
        <Card key={batch.order_batch_id}>
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">รอบที่ {batches.length - index}</p>
            <p className="tabular text-xs text-muted">{formatTime(batch.created_at)}</p>
          </div>

          <ul className="mt-2 divide-y divide-divider">
            {(batch.items ?? []).map((item) => {
              // ชื่อเมนูอาจมาแบบแบนหรือซ้อนใน menu_item ขึ้นกับรุ่นของ API
              const name = item.name ?? item.menu_item?.name ?? "รายการอาหาร";
              return (
                <li
                  key={item.order_item_id}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <span className="text-[15px]">
                    {name}
                    <span className="tabular ml-2 text-muted">×{item.qty}</span>
                  </span>
                  <Badge tone={TONE[item.status] ?? "neutral"}>
                    {ORDER_STATUS_LABEL[item.status] ?? item.status}
                  </Badge>
                </li>
              );
            })}
          </ul>

          {(batch.items ?? []).length === 0 ? (
            <p className="mt-2 text-xs text-muted">ไม่มีรายละเอียดรายการในรอบนี้</p>
          ) : null}
        </Card>
      ))}
    </>
  );
}

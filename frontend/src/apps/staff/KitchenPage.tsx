import { useCallback } from "react";
import { usePolling, useNow } from "../../lib/usePolling";
import { fetchKitchenQueue, setOrderItemStatus } from "../../lib/staffQueries";
import { useToast } from "../../design/toast";
import { Badge, Button, Card, EmptyState, Spinner } from "../../design/primitives";
import type { KitchenItem } from "../../lib/types";
import { IconFlame } from "../../design/icons";
import { formatTime } from "../../lib/format";
import { StaffPage } from "./StaffShell";

// จอครัว — §04 ขั้นที่ 08
//
// ครัวเดียวไม่แยกสถานี ตามที่สเปคระบุ เรียงตามเวลาที่สั่งเพื่อให้ทำตามลำดับจริง
// ปุ่มใหญ่เต็มความกว้างเพราะคนครัวมือเปียกและมองจอจากระยะไกลกว่าคนอื่น
// รายการที่รอนานเกินสิบนาทีจะเน้นสีให้เห็นก่อน เพราะนั่นคือจุดที่ลูกค้าเริ่มถาม

export default function KitchenPage() {
  const toast = useToast();
  const now = useNow(15_000);

  const fetcher = useCallback(() => fetchKitchenQueue(), []);
  const { data, loading, refresh } = usePolling(fetcher, 8000);

  async function advance(
    orderItemId: string,
    next: "PREPARING" | "SERVED",
    name: string,
  ) {
    try {
      await setOrderItemStatus(orderItemId, next);
      toast.show(next === "PREPARING" ? `รับ ${name} แล้ว` : `${name} เสิร์ฟแล้ว`);
      refresh();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "อัปเดตไม่สำเร็จ", "error");
    }
  }

  if (loading && !data) return <Spinner label="กำลังโหลดคิวครัว" />;
  if (!data) return null;

  const pending = data.filter((item) => item.status === "PENDING");
  const preparing = data.filter((item) => item.status === "PREPARING");

  function renderItem(item: KitchenItem, action: "accept" | "serve") {
    const waited = Math.round((now - new Date(item.ordered_at).getTime()) / 60000);
    const late = waited >= 10;

    return (
      <Card
        key={item.order_item_id}
        className={late ? "border-warn-100 bg-warn-50" : ""}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-lg font-bold">
              {item.menu_name}
              <span className="tabular ml-2 text-brand-600">×{item.qty}</span>
            </p>
            <p className="tabular text-sm text-ink-faint">
              โต๊ะ {item.table_nos ?? "—"} · สั่ง {formatTime(item.ordered_at)}
            </p>
          </div>
          <Badge tone={late ? "warn" : "neutral"}>
            <span className="tabular">{waited} นาที</span>
          </Badge>
        </div>

        <div className="mt-3">
          {action === "accept" ? (
            <Button
              block
              size="lg"
              onClick={() => void advance(item.order_item_id, "PREPARING", item.menu_name)}
            >
              รับออเดอร์
            </Button>
          ) : (
            <Button
              block
              size="lg"
              variant="primary"
              onClick={() => void advance(item.order_item_id, "SERVED", item.menu_name)}
            >
              เสิร์ฟแล้ว
            </Button>
          )}
        </div>
      </Card>
    );
  }

  return (
    <StaffPage
      title="ครัว"
      subtitle={`รอรับ ${pending.length} · กำลังเตรียม ${preparing.length}`}
    >
      {data.length === 0 ? (
        <EmptyState
          icon={<IconFlame className="size-8" />}
          title="ไม่มีออเดอร์ค้าง"
          hint="ออเดอร์ใหม่จากโต๊ะจะขึ้นที่นี่ทันทีที่ลูกค้ากดสั่ง"
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <h2 className="mb-2 text-sm font-bold tracking-wide text-ink-soft uppercase">
              รอรับ ({pending.length})
            </h2>
            <div className="space-y-2">
              {pending.length === 0 ? (
                <p className="rounded-xl bg-sunken px-3 py-6 text-center text-sm text-ink-faint">
                  ไม่มีรายการรอรับ
                </p>
              ) : (
                pending.map((item) => renderItem(item, "accept"))
              )}
            </div>
          </div>

          <div>
            <h2 className="mb-2 text-sm font-bold tracking-wide text-ink-soft uppercase">
              กำลังเตรียม ({preparing.length})
            </h2>
            <div className="space-y-2">
              {preparing.length === 0 ? (
                <p className="rounded-xl bg-sunken px-3 py-6 text-center text-sm text-ink-faint">
                  ไม่มีรายการกำลังเตรียม
                </p>
              ) : (
                preparing.map((item) => renderItem(item, "serve"))
              )}
            </div>
          </div>
        </div>
      )}
    </StaffPage>
  );
}

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { fetchMergeCandidates, mergeBills } from "../../lib/staffQueries";
import { useAuth } from "../../lib/auth";
import { useToast } from "../../design/toast";
import { Overlay } from "../../design/overlay";
import { Badge, Button, Notice, Spinner } from "../../design/primitives";
import { IconAlert } from "../../design/icons";
import { VISIT_STATUS_LABEL, type VisitStatus } from "../../lib/types";
import { formatBaht } from "../../lib/format";

// รวมบิลข้ามโต๊ะ — BR-07, ADR-05
//
// รวมได้เฉพาะ Visit ที่มาจากคิวใบเดียวกัน ซึ่งเป็นกฎที่ trigger ในฐานข้อมูลบังคับอยู่แล้ว
// หน้าจอจึงไม่แสดงตัวเลือกที่รวมไม่ได้ตั้งแต่แรก แทนที่จะปล่อยให้กดแล้วโดนปฏิเสธ
//
// Visit ยังแยกกันอยู่หลังรวมบิล เพราะแต่ละโต๊ะมีนาฬิกาของตัวเอง
// ค่าเกินเวลาจึงคิดแยกตามโต๊ะจริง (BR-08) แล้วค่อยรวมยอดที่ชั้น bill_group

export default function MergeBillDialog({
  open,
  onClose,
  visitId,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  visitId: string;
  onDone: () => void;
}) {
  const { staff } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [queueTicketId, setQueueTicketId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<
    { visit_id: string; status: string; bill_group_id: string | null; bill: { net_total: number } | null }[]
  >([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);

    void (async () => {
      // ต้องรู้คิวต้นทางก่อน เพราะมันคือขอบเขตของกลุ่มที่รวมบิลด้วยกันได้
      const { data } = await supabase
        .from("visit")
        .select("queue_ticket_id")
        .eq("visit_id", visitId)
        .maybeSingle();

      if (!active) return;
      const ticketId = data?.queue_ticket_id ?? null;
      setQueueTicketId(ticketId);

      if (ticketId) {
        try {
          const rows = await fetchMergeCandidates(ticketId, visitId);
          if (active) setCandidates(rows);
        } catch {
          if (active) setCandidates([]);
        }
      }
      if (active) setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [open, visitId]);

  async function submit() {
    if (!staff || !queueTicketId) return;
    setBusy(true);
    try {
      await mergeBills(queueTicketId, [visitId, ...picked], staff.staff_id);
      toast.show(`รวมบิล ${picked.length + 1} โต๊ะแล้ว`);
      onDone();
      onClose();
      setPicked([]);
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "รวมบิลไม่สำเร็จ", "error");
    } finally {
      setBusy(false);
    }
  }

  const selectable = candidates.filter(
    (c) => c.status !== "CLOSED" && c.status !== "VOIDED",
  );
  const pickedTotal = selectable
    .filter((c) => picked.includes(c.visit_id))
    .reduce((sum, c) => sum + Number(c.bill?.net_total ?? 0), 0);

  return (
    <Overlay
      open={open}
      onClose={onClose}
      size="lg"
      title="รวมบิลข้ามโต๊ะ"
      description="รวมได้เฉพาะโต๊ะที่เช็คอินมาจากคิวใบเดียวกัน"
      footer={
        <Button
          block
          size="lg"
          disabled={busy || picked.length === 0}
          onClick={() => void submit()}
        >
          {busy ? "กำลังรวม…" : `รวมบิล ${picked.length + 1} โต๊ะ`}
        </Button>
      }
    >
      {loading ? (
        <Spinner label="กำลังหาโต๊ะที่รวมได้" />
      ) : !queueTicketId ? (
        <Notice tone="warn" icon={<IconAlert className="size-4" />}>
          โต๊ะนี้ไม่ได้เช็คอินมาจากคิว (เป็นลูกค้า walk-in) จึงไม่มีกลุ่มให้รวมบิลด้วย
        </Notice>
      ) : selectable.length === 0 ? (
        <Notice tone="neutral">
          ไม่มีโต๊ะอื่นที่มาจากคิวใบเดียวกัน — คิวนี้ใช้โต๊ะเดียว
        </Notice>
      ) : (
        <div className="space-y-3">
          <ul className="space-y-2">
            {selectable.map((row) => {
              const on = picked.includes(row.visit_id);
              const alreadyGrouped = row.bill_group_id !== null;
              return (
                <li key={row.visit_id}>
                  <button
                    type="button"
                    disabled={alreadyGrouped}
                    aria-pressed={on}
                    onClick={() =>
                      setPicked((prev) =>
                        prev.includes(row.visit_id)
                          ? prev.filter((id) => id !== row.visit_id)
                          : [...prev, row.visit_id],
                      )
                    }
                    className={`flex w-full items-center justify-between gap-3 rounded-xl border-2 px-4 py-3 text-left transition-colors disabled:opacity-45 ${
                      on ? "border-brand-500 bg-brand-50" : "border-line-strong bg-surface"
                    }`}
                  >
                    <span>
                      <span className="block font-semibold">
                        Visit {row.visit_id.slice(0, 8)}
                      </span>
                      <span className="block text-xs text-ink-faint">
                        {VISIT_STATUS_LABEL[row.status as VisitStatus] ?? row.status}
                        {alreadyGrouped ? " · รวมบิลไปแล้ว" : ""}
                      </span>
                    </span>
                    <span className="tabular font-semibold">
                      {row.bill ? `${formatBaht(row.bill.net_total)} ฿` : "ยังไม่ออกบิล"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {picked.length > 0 ? (
            <div className="rounded-xl bg-sunken px-4 py-3">
              <p className="flex items-baseline justify-between text-sm">
                <span className="text-ink-soft">ยอดของโต๊ะที่เลือก</span>
                <span className="tabular font-bold">{formatBaht(pickedTotal)} ฿</span>
              </p>
              <p className="mt-1 text-xs text-ink-faint">
                ยังไม่รวมยอดของโต๊ะนี้ · แต่ละโต๊ะยังคิดค่าเกินเวลาแยกตามนาฬิกาของตัวเอง
              </p>
            </div>
          ) : null}

          <Notice tone="neutral">
            <Badge tone="brand">สิทธิ์หัวหน้ากะ</Badge> การรวมบิลถูกบันทึกลง audit log
            และแก้กลับไม่ได้จากหน้าจอนี้
          </Notice>
        </div>
      )}
    </Overlay>
  );
}

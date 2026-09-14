import { useCallback, useState } from "react";
import { usePolling } from "../../lib/usePolling";
import {
  createTable,
  fetchZones,
  softDeleteTable,
  updateTable,
} from "../../lib/adminQueries";
import { fetchTables } from "../../lib/staffQueries";
import { useAuth } from "../../lib/auth";
import { useToast } from "../../design/toast";
import { Overlay } from "../../design/overlay";
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  Notice,
  SectionTitle,
  Select,
  Spinner,
  Stepper,
} from "../../design/primitives";
import { IconPlus, IconTable } from "../../design/icons";
import { TABLE_STATUS_LABEL, type TableStatus } from "../../lib/types";
import { AdminPage } from "./AdminShell";

// โซนและโต๊ะ — §06 กลุ่ม 1
//
// จำนวนที่นั่งที่ตั้งไว้ที่นี่เป็นตัวตั้งของทั้งระบบ ไม่ใช่ข้อมูลประดับ
// ช่องคิว A/B/C แบ่งตามขนาดกลุ่ม และการเช็คอินจะเตือนเมื่อที่นั่งรวมไม่พอกับจำนวนคน
// ตั้งเลขผิดที่นี่ ผลจะไปโผล่เป็นคิวที่จัดโต๊ะไม่ลงตัวหน้าร้าน

const LANE_HINT = (seats: number) =>
  seats <= 2 ? "รับคิวช่อง A" : seats <= 4 ? "รับคิวช่อง B" : "รับคิวช่อง C";

export default function TablesPage() {
  const { staff, atLeast } = useAuth();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<{
    table_id: string;
    table_no: string;
    seat_capacity: number;
    zone_id: string | null;
  } | null>(null);

  const canManage = atLeast("SUPERVISOR");

  const fetcher = useCallback(async () => {
    const [tables, zones] = await Promise.all([fetchTables(), fetchZones()]);
    return { tables, zones };
  }, []);

  const { data, loading, refresh } = usePolling(fetcher, 60_000);

  async function act(action: () => Promise<void>, message: string) {
    try {
      await action();
      toast.show(message);
      refresh();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "ทำรายการไม่สำเร็จ", "error");
    }
  }

  if (loading && !data) return <Spinner label="กำลังโหลดผังโต๊ะ" />;
  if (!data) return null;

  const totalSeats = data.tables.reduce((sum, t) => sum + t.seat_capacity, 0);
  const byZone = new Map<string, typeof data.tables>();
  for (const table of data.tables) {
    const key = table.zone_id ?? "none";
    byZone.set(key, [...(byZone.get(key) ?? []), table]);
  }

  return (
    <AdminPage
      title="โซนและโต๊ะ"
      subtitle={`${data.tables.length} โต๊ะ · รวม ${totalSeats} ที่นั่ง · ${data.zones.length} โซน`}
      action={
        canManage ? (
          <Button icon={<IconPlus />} onClick={() => setCreating(true)}>
            เพิ่มโต๊ะ
          </Button>
        ) : undefined
      }
    >
      <Notice tone="neutral">
        จำนวนที่นั่งเป็นตัวตั้งของการจัดช่องคิวและการเตือนที่นั่งไม่พอตอนเช็คอิน
        การแก้ตัวเลขที่นี่มีผลกับหน้าร้านทันที
      </Notice>

      <div className="mt-4 space-y-5">
        {[...byZone.entries()].map(([zoneId, tables]) => {
          const zone = data.zones.find((z) => z.zone_id === zoneId);
          return (
            <div key={zoneId}>
              <SectionTitle>
                {zone?.name ?? "ไม่ได้ระบุโซน"} — {tables.length} โต๊ะ
              </SectionTitle>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {tables.map((table) => (
                  <Card key={table.table_id}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xl font-bold">{table.table_no}</p>
                        <p className="tabular text-sm text-ink-soft">
                          {table.seat_capacity} ที่นั่ง
                        </p>
                        <p className="mt-0.5 text-xs text-ink-faint">
                          {LANE_HINT(table.seat_capacity)}
                        </p>
                      </div>
                      <Badge
                        tone={
                          table.status === "AVAILABLE"
                            ? "ok"
                            : table.status === "OCCUPIED"
                              ? "brand"
                              : "warn"
                        }
                      >
                        {TABLE_STATUS_LABEL[table.status as TableStatus]}
                      </Badge>
                    </div>

                    {canManage ? (
                      <div className="mt-3 flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setEditing({
                              table_id: table.table_id,
                              table_no: table.table_no,
                              seat_capacity: table.seat_capacity,
                              zone_id: table.zone_id,
                            })
                          }
                        >
                          แก้ไข
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={table.status === "OCCUPIED"}
                          onClick={() =>
                            void act(
                              () => softDeleteTable(table.table_id),
                              `ลบโต๊ะ ${table.table_no} แล้ว (กู้คืนได้)`,
                            )
                          }
                        >
                          ลบ
                        </Button>
                      </div>
                    ) : null}
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {data.tables.length === 0 ? (
        <Card className="mt-4 text-center">
          <IconTable className="mx-auto size-8 text-ink-faint" />
          <p className="mt-2 font-semibold">ยังไม่มีโต๊ะ</p>
        </Card>
      ) : null}

      {/* เพิ่มโต๊ะใหม่ */}
      <TableFormDialog
        open={creating}
        title="เพิ่มโต๊ะ"
        zones={data.zones}
        initial={{ table_no: "", seat_capacity: 4, zone_id: data.zones[0]?.zone_id ?? null }}
        onClose={() => setCreating(false)}
        onSubmit={async (value) => {
          if (!staff) return;
          await act(
            () =>
              createTable({
                branchId: staff.branch_id,
                tableNo: value.table_no,
                seats: value.seat_capacity,
                zoneId: value.zone_id,
              }),
            `เพิ่มโต๊ะ ${value.table_no} แล้ว`,
          );
          setCreating(false);
        }}
      />

      {/* แก้ไขโต๊ะเดิม */}
      <TableFormDialog
        open={editing !== null}
        title={editing ? `แก้ไขโต๊ะ ${editing.table_no}` : "แก้ไขโต๊ะ"}
        zones={data.zones}
        initial={
          editing ?? { table_no: "", seat_capacity: 4, zone_id: null }
        }
        onClose={() => setEditing(null)}
        onSubmit={async (value) => {
          if (!editing) return;
          await act(
            () =>
              updateTable(editing.table_id, {
                table_no: value.table_no,
                seat_capacity: value.seat_capacity,
                zone_id: value.zone_id,
              }),
            "บันทึกแล้ว",
          );
          setEditing(null);
        }}
      />
    </AdminPage>
  );
}

type TableValue = { table_no: string; seat_capacity: number; zone_id: string | null };

function TableFormDialog({
  open,
  title,
  zones,
  initial,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  zones: { zone_id: string; name: string }[];
  initial: TableValue;
  onClose: () => void;
  onSubmit: (value: TableValue) => void;
}) {
  const [value, setValue] = useState<TableValue>(initial);

  // ซิงก์ค่าเริ่มต้นเมื่อเปิดกล่องกับโต๊ะคนละตัว
  const [seen, setSeen] = useState(initial.table_no);
  if (open && seen !== initial.table_no) {
    setSeen(initial.table_no);
    setValue(initial);
  }

  return (
    <Overlay
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <Button
          block
          size="lg"
          disabled={value.table_no.trim().length === 0}
          onClick={() => onSubmit(value)}
        >
          บันทึก
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="หมายเลขโต๊ะ" htmlFor="table_no" hint="เช่น A01, B02, C01">
          <Input
            id="table_no"
            value={value.table_no}
            onChange={(e) => setValue({ ...value, table_no: e.target.value })}
          />
        </Field>

        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-semibold">จำนวนที่นั่ง</p>
            <p className="text-xs text-ink-faint">{LANE_HINT(value.seat_capacity)}</p>
          </div>
          <Stepper
            value={value.seat_capacity}
            onChange={(n) => setValue({ ...value, seat_capacity: n })}
            min={1}
            max={20}
            label="ที่นั่ง"
            size="lg"
          />
        </div>

        <Field label="โซน" htmlFor="zone">
          <Select
            id="zone"
            value={value.zone_id ?? ""}
            onChange={(e) => setValue({ ...value, zone_id: e.target.value || null })}
          >
            <option value="">ไม่ระบุโซน</option>
            {zones.map((zone) => (
              <option key={zone.zone_id} value={zone.zone_id}>
                {zone.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Overlay>
  );
}

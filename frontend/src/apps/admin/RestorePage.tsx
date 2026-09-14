import { useCallback, useState } from "react";
import { usePolling } from "../../lib/usePolling";
import { fetchAuditLog, fetchDeleted, restoreRecord } from "../../lib/adminQueries";
import { useAuth } from "../../lib/auth";
import { useToast } from "../../design/toast";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Notice,
  SectionTitle,
  Spinner,
} from "../../design/primitives";
import { IconRestore } from "../../design/icons";
import { AdminPage } from "./AdminShell";

// กู้คืนข้อมูลและ audit log — BR-10 และ ADR-08
//
// เหตุผลที่มีหน้านี้: พนักงานหมุนเวียนสูงและกดผิดบ่อย การกู้คืนต้องทำได้เองในร้าน
// ไม่ใช่ต้องโทรหา dev ส่วน audit log อ่านได้เฉพาะเจ้าของร้านเพราะมีข้อมูลก่อน-หลังของทุกการแก้

const TABLES = [
  { id: "visit" as const, label: "Visit" },
  { id: "menu_item" as const, label: "เมนู" },
  { id: "dining_table" as const, label: "โต๊ะ" },
];

const ACTION_LABEL: Record<string, string> = {
  INSERT: "สร้าง",
  UPDATE: "แก้ไข",
  SOFT_DELETE: "ลบ",
  RESTORE: "กู้คืน",
};

export default function RestorePage() {
  const { atLeast } = useAuth();
  const toast = useToast();
  const [table, setTable] = useState<(typeof TABLES)[number]["id"]>("visit");
  const isOwner = atLeast("OWNER");

  const fetcher = useCallback(async () => {
    const [deleted, audit] = await Promise.all([
      fetchDeleted(table),
      isOwner ? fetchAuditLog() : Promise.resolve([]),
    ]);
    return { deleted, audit };
  }, [table, isOwner]);

  const { data, loading, refresh } = usePolling(fetcher, 30_000);

  async function restore(recordId: string) {
    try {
      await restoreRecord(table, recordId);
      toast.show("กู้คืนเรียบร้อย");
      refresh();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "กู้คืนไม่สำเร็จ", "error");
    }
  }

  if (loading && !data) return <Spinner label="กำลังโหลด" />;

  const idKey: Record<string, string> = {
    visit: "visit_id",
    menu_item: "menu_item_id",
    dining_table: "table_id",
  };

  function describe(row: Record<string, unknown>): string {
    if (table === "menu_item") return String(row.name ?? "");
    if (table === "dining_table") return `โต๊ะ ${row.table_no ?? ""}`;
    return `Visit ${String(row.visit_id ?? "").slice(0, 8)}`;
  }

  return (
    <AdminPage
      title="กู้คืนและ audit"
      subtitle="ระบบไม่มีการลบจริง ทุกอย่างที่ลบไปกู้กลับได้จากที่นี่"
    >
      <div className="mb-3 flex flex-wrap gap-2">
        {TABLES.map((item) => (
          <Button
            key={item.id}
            size="sm"
            variant={table === item.id ? "primary" : "outline"}
            onClick={() => setTable(item.id)}
          >
            {item.label}
          </Button>
        ))}
      </div>

      <Card padded={false}>
        <h2 className="border-b border-line px-4 py-3 font-bold">
          รายการที่ถูกลบ ({data?.deleted.length ?? 0})
        </h2>
        {(data?.deleted.length ?? 0) === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<IconRestore className="size-7" />}
              title="ไม่มีรายการที่ถูกลบ"
              hint="ถ้าเผลอลบอะไรไป รายการจะมาอยู่ที่นี่ให้กดกู้คืนได้"
            />
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {data?.deleted.map((row) => {
              const id = String(row[idKey[table] ?? "id"] ?? "");
              return (
                <li
                  key={id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div>
                    <p className="font-semibold">{describe(row)}</p>
                    <p className="tabular text-xs text-ink-faint">
                      ลบเมื่อ{" "}
                      {row.deleted_at
                        ? new Date(String(row.deleted_at)).toLocaleString("th-TH")
                        : "—"}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => void restore(id)}>
                    กู้คืน
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <div className="mt-6">
        <SectionTitle>บันทึกการเปลี่ยนแปลง</SectionTitle>
        {!isOwner ? (
          <Notice tone="neutral">
            audit log อ่านได้เฉพาะเจ้าของร้าน เพราะเก็บข้อมูลก่อน-หลังของทุกการแก้ไข
          </Notice>
        ) : (data?.audit.length ?? 0) === 0 ? (
          <EmptyState title="ยังไม่มีบันทึก" />
        ) : (
          <Card padded={false} className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-sm">
              <thead className="border-b border-line text-left text-xs text-ink-faint">
                <tr>
                  <th className="px-4 py-3 font-semibold">เวลา</th>
                  <th className="px-4 py-3 font-semibold">ตาราง</th>
                  <th className="px-4 py-3 font-semibold">การกระทำ</th>
                  <th className="px-4 py-3 font-semibold">ผู้ทำ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data?.audit.slice(0, 40).map((entry) => (
                  <tr key={entry.audit_id}>
                    <td className="tabular px-4 py-2.5">
                      {new Date(entry.created_at).toLocaleString("th-TH")}
                    </td>
                    <td className="px-4 py-2.5">{entry.table_name}</td>
                    <td className="px-4 py-2.5">
                      <Badge
                        tone={
                          entry.action === "SOFT_DELETE"
                            ? "warn"
                            : entry.action === "RESTORE"
                              ? "ok"
                              : "neutral"
                        }
                      >
                        {ACTION_LABEL[entry.action] ?? entry.action}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5">{entry.staff?.full_name ?? "ระบบ"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </AdminPage>
  );
}

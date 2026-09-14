import { useCallback, useState } from "react";
import { usePolling } from "../../lib/usePolling";
import {
  clearStaffPin,
  fetchStaffDirectory,
  setStaffActive,
  setStaffPin,
  setStaffRole,
  type StaffDirectoryRow,
} from "../../lib/adminQueries";
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
  Select,
  Spinner,
} from "../../design/primitives";
import { ROLE_LABEL, type StaffRole } from "../../lib/types";
import { AdminPage } from "./AdminShell";

// พนักงานและสิทธิ์ — §06 กลุ่ม 1
//
// สามบทบาทเรียงจากน้อยไปมาก: พนักงาน → หัวหน้ากะ → เจ้าของร้าน
// สิทธิ์จริงบังคับด้วย RLS ที่ฐานข้อมูล หน้านี้เป็นเพียงที่ตั้งค่า ไม่ใช่ที่บังคับ
//
// PIN ใช้ยืนยันซ้ำตอนทำรายการที่มีผลทางการเงิน ค่าที่ตั้งถูกส่งไปแฮชในฐานข้อมูล
// และไม่เคยถูกอ่านกลับมาที่เบราว์เซอร์เลย หน้านี้รู้แค่ว่า "มี PIN แล้วหรือยัง"

const ROLES: StaffRole[] = ["STAFF", "SUPERVISOR", "OWNER"];

const ROLE_ABILITY: Record<StaffRole, string> = {
  STAFF: "รับคิว จัดโต๊ะ รับออเดอร์ รับเงิน ปิดโต๊ะ",
  SUPERVISOR: "ทุกอย่างของพนักงาน + ยกเลิก Visit รวมบิล แก้เมนู กู้คืนข้อมูล",
  OWNER: "ทุกอย่างของหัวหน้ากะ + แก้ราคา ดูรายงานและ audit log",
};

export default function AdminStaffPage() {
  const { staff: me, atLeast } = useAuth();
  const toast = useToast();
  const [pinTarget, setPinTarget] = useState<StaffDirectoryRow | null>(null);

  const fetcher = useCallback(() => fetchStaffDirectory(), []);
  const { data, loading, error, refresh } = usePolling(fetcher, 60_000);

  const canManage = atLeast("SUPERVISOR");

  async function act(action: () => Promise<void>, message: string) {
    try {
      await action();
      toast.show(message);
      refresh();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "ทำรายการไม่สำเร็จ", "error");
    }
  }

  if (loading && !data) return <Spinner label="กำลังโหลดรายชื่อพนักงาน" />;

  return (
    <AdminPage
      title="พนักงานและสิทธิ์"
      subtitle="สามบทบาท · สิทธิ์จริงบังคับที่ฐานข้อมูล ไม่ใช่ที่หน้าจอ"
    >
      {error ? (
        <Notice tone="warn">
          {error.message.includes("v_staff_directory")
            ? "ยังไม่ได้ push migration 0017 จึงยังไม่มี view สำหรับหน้านี้"
            : error.message}
        </Notice>
      ) : null}

      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        {ROLES.map((role) => (
          <Card key={role}>
            <p className="font-bold">{ROLE_LABEL[role]}</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-faint">
              {ROLE_ABILITY[role]}
            </p>
          </Card>
        ))}
      </div>

      <Card padded={false} className="overflow-x-auto">
        <table className="w-full min-w-[44rem] text-sm">
          <thead className="border-b border-line text-left text-xs text-ink-faint">
            <tr>
              <th className="px-4 py-3 font-semibold">ชื่อ</th>
              <th className="px-4 py-3 font-semibold">บทบาท</th>
              <th className="px-4 py-3 font-semibold">บัญชีเข้าระบบ</th>
              <th className="px-4 py-3 font-semibold">PIN</th>
              <th className="px-4 py-3 font-semibold">สถานะ</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {data?.map((row) => {
              const isMe = row.staff_id === me?.staff_id;
              return (
                <tr key={row.staff_id} className={row.is_active ? "" : "opacity-55"}>
                  <td className="px-4 py-3 font-semibold">
                    {row.full_name}
                    {isMe ? (
                      <span className="ml-2 text-xs font-normal text-ink-faint">(คุณ)</span>
                    ) : null}
                  </td>

                  <td className="px-4 py-3">
                    {canManage && !isMe ? (
                      <Select
                        value={row.role}
                        className="min-h-10 w-40 text-sm"
                        aria-label={`บทบาทของ ${row.full_name}`}
                        onChange={(e) =>
                          void act(
                            () => setStaffRole(row.staff_id, e.target.value as StaffRole),
                            `เปลี่ยนบทบาท ${row.full_name} แล้ว`,
                          )
                        }
                      >
                        {ROLES.map((role) => (
                          <option key={role} value={role}>
                            {ROLE_LABEL[role]}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <Badge tone={row.role === "OWNER" ? "brand" : "neutral"}>
                        {ROLE_LABEL[row.role]}
                      </Badge>
                    )}
                  </td>

                  <td className="px-4 py-3">
                    {row.linked_to_auth ? (
                      <Badge tone="ok">ผูกแล้ว</Badge>
                    ) : (
                      <Badge tone="warn">ยังไม่ผูก</Badge>
                    )}
                  </td>

                  <td className="px-4 py-3">
                    {row.has_pin ? <Badge tone="ok">ตั้งแล้ว</Badge> : <span className="text-ink-faint">—</span>}
                  </td>

                  <td className="px-4 py-3">
                    {row.is_active ? "ทำงานอยู่" : "ปิดการใช้งาน"}
                  </td>

                  <td className="px-4 py-3">
                    {canManage ? (
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <Button size="sm" variant="outline" onClick={() => setPinTarget(row)}>
                          {row.has_pin ? "เปลี่ยน PIN" : "ตั้ง PIN"}
                        </Button>
                        {row.has_pin ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              void act(
                                () => clearStaffPin(row.staff_id),
                                `ล้าง PIN ของ ${row.full_name} แล้ว`,
                              )
                            }
                          >
                            ล้าง
                          </Button>
                        ) : null}
                        {!isMe ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              void act(
                                () => setStaffActive(row.staff_id, !row.is_active),
                                row.is_active ? "ปิดการใช้งานแล้ว" : "เปิดใช้งานแล้ว",
                              )
                            }
                          >
                            {row.is_active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <Notice tone="neutral">
        การเพิ่มพนักงานใหม่ทำโดยให้เจ้าตัวสมัครบัญชีใน Supabase Auth
        แล้วระบบจะสร้างแถวพนักงานในบทบาท "พนักงาน" ให้อัตโนมัติ จากนั้นค่อยเลื่อนบทบาทที่นี่
      </Notice>

      <PinDialog
        target={pinTarget}
        onClose={() => setPinTarget(null)}
        onSubmit={async (pin) => {
          if (!pinTarget) return;
          await act(
            () => setStaffPin(pinTarget.staff_id, pin),
            `ตั้ง PIN ให้ ${pinTarget.full_name} แล้ว`,
          );
          setPinTarget(null);
        }}
      />
    </AdminPage>
  );
}

function PinDialog({
  target,
  onClose,
  onSubmit,
}: {
  target: StaffDirectoryRow | null;
  onClose: () => void;
  onSubmit: (pin: string) => void;
}) {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");

  const valid = /^[0-9]{4,6}$/.test(pin);
  const matched = pin === confirm;

  return (
    <Overlay
      open={target !== null}
      onClose={() => {
        setPin("");
        setConfirm("");
        onClose();
      }}
      title={target ? `ตั้ง PIN ให้ ${target.full_name}` : "ตั้ง PIN"}
      description="ใช้ยืนยันซ้ำตอนเปิดโต๊ะ รับเงิน ปิดโต๊ะ และยกเลิก"
      footer={
        <Button
          block
          size="lg"
          disabled={!valid || !matched}
          onClick={() => {
            onSubmit(pin);
            setPin("");
            setConfirm("");
          }}
        >
          บันทึก PIN
        </Button>
      }
    >
      <div className="space-y-4">
        <Field
          label="PIN ใหม่"
          htmlFor="pin"
          hint="ตัวเลข 4 ถึง 6 หลัก"
          error={pin.length > 0 && !valid ? "ต้องเป็นตัวเลข 4 ถึง 6 หลัก" : null}
        >
          <Input
            id="pin"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          />
        </Field>

        <Field
          label="ยืนยัน PIN"
          htmlFor="confirm"
          error={confirm.length > 0 && !matched ? "PIN ไม่ตรงกัน" : null}
        >
          <Input
            id="confirm"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            maxLength={6}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ""))}
          />
        </Field>

        <Notice tone="neutral">
          PIN ถูกแฮชในฐานข้อมูลและไม่เคยถูกส่งกลับมาที่เบราว์เซอร์
          ถ้าลืมต้องตั้งใหม่ ไม่มีทางดูของเดิม
        </Notice>
      </div>
    </Overlay>
  );
}

import { NavLink, Outlet } from "react-router";
import type { ReactNode } from "react";
import { useAuth } from "../../lib/auth";
import { ROLE_LABEL } from "../../lib/types";
import { Button, Notice, Spinner } from "../../design/primitives";
import {
  IconChart,
  IconGrid,
  IconTable,
  IconUsers,
  IconLogout,
  IconMenuBook,
  IconReceipt,
  IconRestore,
} from "../../design/icons";
import LoginPage from "../staff/LoginPage";

// โครงหน้าจอหลังร้าน
//
// ต่างจากฝั่งพนักงานตรงที่ออกแบบสำหรับจอใหญ่และการนั่งดูนาน ๆ
// เมนูจึงอยู่ด้านข้างเสมอ ไม่ย้ายลงล่าง และตารางข้อมูลกว้างเต็มที่เพื่อเทียบตัวเลขได้

const NAV: { to: string; label: string; icon: ReactNode }[] = [
  { to: "/admin", label: "ภาพรวม", icon: <IconChart /> },
  { to: "/admin/menu", label: "เมนู", icon: <IconMenuBook /> },
  { to: "/admin/packages", label: "แพ็กเกจและราคา", icon: <IconReceipt /> },
  { to: "/admin/tables", label: "โซนและโต๊ะ", icon: <IconTable /> },
  { to: "/admin/staff", label: "พนักงาน", icon: <IconUsers /> },
  { to: "/admin/stock", label: "สต๊อก", icon: <IconGrid /> },
  { to: "/admin/visits", label: "ประวัติการขาย", icon: <IconReceipt /> },
  { to: "/admin/restore", label: "กู้คืนและ audit", icon: <IconRestore /> },
];

export default function AdminShell() {
  const { staff, loading, signOut, atLeast } = useAuth();

  if (loading) return <Spinner label="กำลังตรวจสิทธิ์" />;
  if (!staff) return <LoginPage />;

  // หลังร้านเป็นเรื่องเงินและข้อมูลหลัก จึงกันไว้ที่หัวหน้ากะขึ้นไป
  if (!atLeast("SUPERVISOR")) {
    return (
      <div className="mx-auto max-w-md px-4 py-20">
        <Notice tone="warn">
          บัญชีนี้เป็น {ROLE_LABEL[staff.role]} จึงเข้าหน้าหลังร้านไม่ได้
          หากต้องการสิทธิ์เพิ่มให้ติดต่อเจ้าของร้าน
        </Notice>
        <Button variant="outline" block className="mt-4" onClick={() => void signOut()}>
          ออกจากระบบ
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-surface md:flex">
        <div className="px-5 py-5">
          <p className="text-lg font-bold">หมากระทุปุ๊ป๊ะ</p>
          <p className="text-xs text-ink-faint">หลังร้าน</p>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/admin"}
              className={({ isActive }) =>
                `flex min-h-12 items-center gap-3 rounded-xl px-3 text-[15px] font-semibold transition-colors ${
                  isActive ? "bg-brand-500 text-white" : "text-ink-soft hover:bg-sunken"
                }`
              }
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-line p-3">
          <p className="px-2 text-sm font-semibold">{staff.full_name}</p>
          <p className="mb-2 px-2 text-xs text-ink-faint">{ROLE_LABEL[staff.role]}</p>
          <Button variant="ghost" block icon={<IconLogout />} onClick={() => void signOut()}>
            ออกจากระบบ
          </Button>
        </div>
      </aside>

      <div className="flex-1">
        {/* เมนูแนวนอนสำหรับจอแคบ — หลังร้านไม่ได้ออกแบบให้ใช้บนมือถือเป็นหลัก */}
        <nav className="flex gap-1 overflow-x-auto border-b border-line bg-surface px-3 py-2 md:hidden">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/admin"}
              className={({ isActive }) =>
                `flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-semibold ${
                  isActive ? "bg-brand-500 text-white" : "text-ink-soft"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <Outlet />
      </div>
    </div>
  );
}

export function AdminPage({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle ? <p className="mt-0.5 text-sm text-ink-faint">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

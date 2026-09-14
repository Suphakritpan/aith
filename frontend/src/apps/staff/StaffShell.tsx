import { NavLink, Outlet, useNavigate } from "react-router";
import type { ReactNode } from "react";
import { useAuth } from "../../lib/auth";
import { ROLE_LABEL } from "../../lib/types";
import { Button, Spinner } from "../../design/primitives";
import {
  IconBell,
  IconClock,
  IconFlame,
  IconGrid,
  IconLogout,
  IconUsers,
} from "../../design/icons";
import LoginPage from "./LoginPage";

// โครงหน้าจอฝั่งพนักงาน
//
// แถบเมนูอยู่ด้านล่างบนจอเล็กและด้านซ้ายบนจอกว้าง เพราะพนักงานถือแท็บเล็ตมือเดียว
// นิ้วโป้งเอื้อมถึงขอบล่างได้ แต่เอื้อมถึงขอบบนไม่ได้
// เมนูมีห้าอัน ทุกงานหลักจึงอยู่ห่างจากหน้าไหนก็ตามไม่เกินหนึ่งครั้งกด

const NAV: { to: string; label: string; icon: ReactNode }[] = [
  { to: "/staff", label: "แดชบอร์ด", icon: <IconGrid /> },
  { to: "/staff/queue", label: "คิว", icon: <IconUsers /> },
  { to: "/staff/floor", label: "ผังโต๊ะ", icon: <IconBell /> },
  { to: "/staff/kitchen", label: "ครัว", icon: <IconFlame /> },
  { to: "/staff/reservations", label: "จอง", icon: <IconClock /> },
];

export default function StaffShell() {
  const { staff, loading, signOut } = useAuth();
  const navigate = useNavigate();

  if (loading) return <Spinner label="กำลังตรวจสิทธิ์" />;
  if (!staff) return <LoginPage />;

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      {/* แถบข้างบนจอกว้าง */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-line bg-surface lg:flex">
        <div className="px-5 py-5">
          <p className="text-lg font-bold">หมากระทุปุ๊ป๊ะ</p>
          <p className="text-xs text-ink-faint">ระบบพนักงาน</p>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/staff"}
              className={({ isActive }) =>
                `flex min-h-12 items-center gap-3 rounded-xl px-3 text-[15px] font-semibold transition-colors ${
                  isActive
                    ? "bg-brand-500 text-white"
                    : "text-ink-soft hover:bg-sunken"
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
          <Button
            variant="ghost"
            block
            icon={<IconLogout />}
            onClick={() => void signOut().then(() => navigate("/staff"))}
          >
            ออกจากระบบ
          </Button>
        </div>
      </aside>

      {/* หัวเรื่องบนจอเล็ก */}
      <header className="flex items-center justify-between border-b border-line bg-surface px-4 py-3 lg:hidden">
        <div>
          <p className="font-bold">{staff.full_name}</p>
          <p className="text-xs text-ink-faint">{ROLE_LABEL[staff.role]}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          icon={<IconLogout />}
          onClick={() => void signOut()}
        >
          ออก
        </Button>
      </header>

      <main className="flex-1 pb-24 lg:pb-0">
        <Outlet />
      </main>

      {/* แถบเมนูล่างบนจอเล็ก */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/staff"}
            className={({ isActive }) =>
              `flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-semibold transition-colors ${
                isActive ? "text-brand-500" : "text-ink-faint"
              }`
            }
          >
            {item.icon}
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export function StaffPage({
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
    <div className="mx-auto w-full max-w-6xl px-4 py-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
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

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { StaffRole } from "./types";

// ตัวตนของพนักงานที่ล็อกอินอยู่
//
// Supabase Auth บอกได้แค่ว่า "เป็นใคร" แต่ไม่รู้ว่าคนนี้เป็นพนักงานของสาขาไหนหรือบทบาทอะไร
// ข้อมูลนั้นอยู่ในตาราง staff จึงต้องอ่านต่ออีกชั้นหนึ่งหลังล็อกอินสำเร็จ
// ถ้าบัญชียังไม่ถูกผูกกับแถวใน staff จะถือว่าเข้าหลังร้านไม่ได้ แม้ล็อกอินผ่าน

export type StaffProfile = {
  staff_id: string;
  branch_id: string;
  full_name: string;
  role: StaffRole;
  has_pin: boolean;
};

type AuthState = {
  session: Session | null;
  staff: StaffProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** STAFF < SUPERVISOR < OWNER — ใช้ซ่อนเมนูและปุ่มที่บทบาทนี้กดไม่ได้ */
  atLeast: (role: StaffRole) => boolean;
};

const RANK: Record<StaffRole, number> = { STAFF: 1, SUPERVISOR: 2, OWNER: 3 };

const AuthContext = createContext<AuthState | null>(null);

async function loadStaff(): Promise<StaffProfile | null> {
  // อ่านผ่าน RPC ไม่ใช่ select จากตาราง staff ตรง ๆ ด้วยเหตุผลสองข้อ
  //
  // หนึ่ง — RLS ยอมให้พนักงานเห็นเพื่อนร่วมสาขาทุกคน การ select เองจึงต้องจำไว้เสมอว่า
  // ต้องกรอง auth_user_id ทุกครั้ง ลืมเมื่อไรก็ได้หลายแถว ฟังก์ชันนี้กรองให้ในตัว
  //
  // สอง — ของเดิมดึง pin_hash ลงมาคำนวณ has_pin ที่เบราว์เซอร์ ซึ่งแปลว่า hash ของ PIN
  // อยู่ห่างจาก DevTools แค่คำสั่งเดียว (0017 ถอนสิทธิ์อ่านคอลัมน์นั้นไปแล้ว)
  // ตอนนี้ has_pin คำนวณในฐานข้อมูลและคืนมาเป็น boolean ตัว hash จึงไม่ออกจากเซิร์ฟเวอร์
  const { data } = await supabase.rpc("fn_my_staff_profile");

  const row = (Array.isArray(data) ? data[0] : data) as
    | (Omit<StaffProfile, "role"> & { role: string })
    | null
    | undefined;

  if (!row) return null;
  return { ...row, role: row.role as StaffRole };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [staff, setStaff] = useState<StaffProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    // อ่านเซสชันที่ค้างอยู่ก่อน เพื่อไม่ให้หน้าเด้งไปล็อกอินทั้งที่ยังล็อกอินอยู่
    void supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      setStaff(data.session ? await loadStaff() : null);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, next) => {
      if (!active) return;
      setSession(next);
      setStaff(next ? await loadStaff() : null);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      // ข้อความจาก Supabase เป็นภาษาอังกฤษ แปลงเป็นข้อความที่พนักงานเข้าใจ
      throw new Error(
        error.message.includes("Invalid login")
          ? "อีเมลหรือรหัสผ่านไม่ถูกต้อง"
          : error.message,
      );
    }
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setStaff(null);
  }, []);

  const atLeast = useCallback(
    (role: StaffRole) => (staff ? RANK[staff.role] >= RANK[role] : false),
    [staff],
  );

  const value = useMemo(
    () => ({ session, staff, loading, signIn, signOut, atLeast }),
    [session, staff, loading, signIn, signOut, atLeast],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth ต้องอยู่ภายใต้ AuthProvider");
  return context;
}

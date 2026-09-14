import { Navigate, useSearchParams } from "react-router";
import { useAuth } from "../../lib/auth";
import { Spinner } from "../../design/primitives";
import LoginPage from "./LoginPage";

// /login — ทางเข้าเดียวของทั้งฝั่งพนักงานและหลังร้าน
//
// ปกติผู้ใช้ไม่ต้องมาที่นี่เอง เพราะ /staff และ /admin แสดงหน้าล็อกอินให้อยู่แล้ว
// เส้นทางนี้มีไว้สำหรับลิงก์ตรงและการบุ๊กมาร์ก เช่นแปะไว้ที่หน้าจอเคาน์เตอร์
//
// ล็อกอินแล้วจะพาไปตามบทบาท: เจ้าของร้านและหัวหน้ากะเข้าหลังร้านได้
// ส่วนพนักงานทั่วไปเข้าไม่ได้ จึงพาไปหน้างานหน้าร้านแทน ไม่ใช่โยนไปหน้าที่จะโดนปฏิเสธ

export default function LoginRoute() {
  const { staff, loading, atLeast } = useAuth();
  const [params] = useSearchParams();

  if (loading) return <Spinner label="กำลังตรวจสิทธิ์" />;

  if (staff) {
    const next = params.get("next");
    if (next?.startsWith("/")) return <Navigate to={next} replace />;
    return <Navigate to={atLeast("SUPERVISOR") ? "/admin" : "/staff"} replace />;
  }

  return <LoginPage />;
}

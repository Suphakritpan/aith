import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import "./index.css";

import { AuthProvider } from "./lib/auth";
import { ToastProvider } from "./design/toast";

import DirectoryPage from "./apps/DirectoryPage";
import DisplayPage from "./apps/display/DisplayPage";

import LandingPage from "./apps/customer/LandingPage";
import QueuePage from "./apps/customer/QueuePage";
import TablePage from "./apps/customer/TablePage";
import SplitPage from "./apps/customer/SplitPage";
import ReservePage from "./apps/customer/ReservePage";

import LoginRoute from "./apps/staff/LoginRoute";
import StaffShell from "./apps/staff/StaffShell";
import DashboardPage from "./apps/staff/DashboardPage";
import StaffQueuePage from "./apps/staff/QueuePage";
import FloorPage from "./apps/staff/FloorPage";
import KitchenPage from "./apps/staff/KitchenPage";
import VisitPage from "./apps/staff/VisitPage";
import ReservationsPage from "./apps/staff/ReservationsPage";

import AdminShell from "./apps/admin/AdminShell";
import OverviewPage from "./apps/admin/OverviewPage";
import MenuPage from "./apps/admin/MenuPage";
import PackagesPage from "./apps/admin/PackagesPage";
import TablesPage from "./apps/admin/TablesPage";
import AdminStaffPage from "./apps/admin/StaffPage";
import StockPage from "./apps/admin/StockPage";
import VisitsPage from "./apps/admin/VisitsPage";
import RestorePage from "./apps/admin/RestorePage";

// เส้นทางทั้งระบบ แบ่งตามผู้ใช้สี่กลุ่ม
//
//   ลูกค้า        /                  รับคิว
//                 /reserve           จองโต๊ะล่วงหน้า
//                 /q/:token          ดูลำดับคิวของตัวเอง
//                 /t/:token          หน้าโต๊ะ ปลายทางของ QR
//                 /t/:token/split    แยกบิล หารตามหัวหรือจ่ายคนละก้อน
//
//   จอหน้าร้าน    /display           คิว TV อ่านอย่างเดียว ไม่ต้องล็อกอิน
//
//   พนักงาน       /staff/*           ต้องล็อกอิน
//   เจ้าของร้าน   /admin/*           ต้องเป็นหัวหน้ากะขึ้นไป
//
//   /login        ทางเข้าเดียวของทั้งสองฝั่งหลังบ้าน
//   /pages        สารบัญรวมทุกหน้า สำหรับเดินดูงานและสาธิต

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/reserve" element={<ReservePage />} />
            <Route path="/q/:token" element={<QueuePage />} />
            <Route path="/t/:token" element={<TablePage />} />
            <Route path="/t/:token/split" element={<SplitPage />} />

            <Route path="/display" element={<DisplayPage />} />
            <Route path="/login" element={<LoginRoute />} />
            <Route path="/pages" element={<DirectoryPage />} />

            <Route path="/staff" element={<StaffShell />}>
              <Route index element={<DashboardPage />} />
              <Route path="queue" element={<StaffQueuePage />} />
              <Route path="floor" element={<FloorPage />} />
              <Route path="kitchen" element={<KitchenPage />} />
              <Route path="reservations" element={<ReservationsPage />} />
              <Route path="visit/:visitId" element={<VisitPage />} />
            </Route>

            <Route path="/admin" element={<AdminShell />}>
              <Route index element={<OverviewPage />} />
              <Route path="menu" element={<MenuPage />} />
              <Route path="packages" element={<PackagesPage />} />
              <Route path="tables" element={<TablesPage />} />
              <Route path="staff" element={<AdminStaffPage />} />
              <Route path="stock" element={<StockPage />} />
              <Route path="visits" element={<VisitsPage />} />
              <Route path="restore" element={<RestorePage />} />
            </Route>

            <Route path="*" element={<Navigate to="/pages" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  </StrictMode>,
);

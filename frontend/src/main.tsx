import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import "./index.css";

import LandingPage from "./apps/customer/LandingPage";
import QueuePage from "./apps/customer/QueuePage";
import TablePage from "./apps/customer/TablePage";

// เส้นทางฝั่งลูกค้าตาม §04
//   /            รับคิว
//   /q/:token    ดูลำดับคิวของตัวเอง
//   /t/:token    หน้าโต๊ะ — ปลายทางของ QR ที่พนักงานพิมพ์ให้
//
// ฝั่ง Staff และ Admin จะเพิ่มภายใต้ /staff และ /admin ทีหลัง
// ทั้งสองส่วนต้องล็อกอิน จึงแยกออกจากกลุ่มเส้นทางนี้ที่เปิดสาธารณะ

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/q/:token" element={<QueuePage />} />
        <Route path="/t/:token" element={<TablePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);

import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// dev server ยิง /api ไปที่ Edge Function ของ Supabase
// เพื่อให้โค้ดฝั่ง client ใช้เส้นทางเดียวกันทั้งตอน dev และตอน deploy จริง
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const target = env.VITE_PROXY_TARGET || `${env.VITE_SUPABASE_URL}/functions/v1`;

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target,
          changeOrigin: true,
          secure: true,
        },
      },
    },
  };
});

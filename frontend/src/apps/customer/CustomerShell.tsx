import type { ReactNode } from "react";

// โครงหน้าจอฝั่งลูกค้า
//
// จำกัดความกว้างไว้ที่ขนาดมือถือแม้เปิดบนจอใหญ่ เพราะเนื้อหาฝั่งลูกค้าเป็นคอลัมน์เดียวทั้งหมด
// การยืดเต็มจอจะทำให้บรรทัดยาวจนอ่านยากโดยไม่ได้ข้อมูลเพิ่ม
//
// แถบล่างเป็นแบบ sticky และเผื่อ safe-area ของ iOS ไว้ เพราะปุ่มหลักอยู่ตรงนั้น
// และเป็นบริเวณที่นิ้วโป้งเอื้อมถึงสบายที่สุดเมื่อถือมือถือมือเดียว

export default function CustomerShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <header className="px-4 pt-7 pb-3">
        <h1 className="text-3xl font-bold tracking-tight text-balance">{title}</h1>
        {subtitle ? (
          <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{subtitle}</p>
        ) : null}
      </header>

      <main className="flex-1 space-y-3 px-4 pb-6">{children}</main>

      {footer ? (
        <footer className="sticky bottom-0 border-t border-line bg-ground/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
          {footer}
        </footer>
      ) : null}
    </div>
  );
}

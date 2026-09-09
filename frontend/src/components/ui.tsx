import type { ButtonHTMLAttributes, ReactNode } from "react";

// ชิ้นส่วนหน้าจอที่ใช้ซ้ำ เขียนให้พอดีกับที่ต้องใช้จริง ไม่ทำเป็นดีไซน์ซิสเต็มเต็มรูปแบบ

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-divider bg-surface p-4 shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "outline" | "ghost";
  size?: "md" | "lg";
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition " +
    "disabled:cursor-not-allowed disabled:opacity-50 " +
    // ปุ่มบนมือถือต้องกดโดนง่าย จึงกันความสูงขั้นต่ำไว้ตามเกณฑ์พื้นที่สัมผัส
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500";
  const sizes = {
    md: "min-h-11 px-4 text-[15px]",
    lg: "min-h-14 w-full px-5 text-base",
  };
  const variants = {
    primary: "bg-brand-500 text-white active:bg-brand-700",
    outline: "border border-brand-300 bg-surface text-brand-700 active:bg-brand-100",
    ghost: "text-muted-strong active:bg-brand-100",
  };
  return (
    <button
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
      {...props}
    />
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "brand" | "warn" | "done";
}) {
  const tones = {
    neutral: "bg-brand-100 text-muted-strong",
    brand: "bg-brand-500 text-white",
    warn: "bg-amber-100 text-amber-900",
    done: "bg-emerald-100 text-emerald-900",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function PageShell({
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
      <header className="px-4 pt-6 pb-3">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted-strong">{subtitle}</p> : null}
      </header>
      <main className="flex-1 space-y-3 px-4 pb-6">{children}</main>
      {footer ? (
        <footer className="sticky bottom-0 border-t border-divider bg-ground/95 px-4 py-3 backdrop-blur">
          {footer}
        </footer>
      ) : null}
    </div>
  );
}

export function Notice({
  tone = "info",
  children,
}: {
  tone?: "info" | "warn" | "error";
  children: ReactNode;
}) {
  const tones = {
    info: "border-divider bg-brand-100 text-muted-strong",
    warn: "border-amber-300 bg-amber-50 text-amber-900",
    error: "border-red-300 bg-red-50 text-red-900",
  };
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${tones[tone]}`} role="status">
      {children}
    </div>
  );
}

export function Spinner({ label = "กำลังโหลด" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-10 text-sm text-muted">
      <span
        className="size-4 animate-spin rounded-full border-2 border-brand-300 border-t-brand-500"
        aria-hidden
      />
      {label}
    </div>
  );
}

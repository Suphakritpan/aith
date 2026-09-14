import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";
import { IconMinus, IconPlus } from "./icons";

// ชิ้นส่วนพื้นฐานที่ทั้งสามฝั่งใช้ร่วมกัน
//
// กติกาที่ยึดตลอด: ทุกอย่างที่กดได้สูงอย่างน้อย 44px, สีบอกสถานะมีความหมายตายตัว
// และไม่มีสถานะไหนที่สื่อด้วยสีอย่างเดียว ต้องมีข้อความหรือไอคอนกำกับเสมอ
// เพราะพนักงานบางคนตาบอดสี และหน้าจอในร้านมักโดนแสงจนสีเพี้ยน

export type Tone = "neutral" | "brand" | "ok" | "warn" | "info";

/* ── ปุ่ม ─────────────────────────────────────────────────────────────────── */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  block?: boolean;
  icon?: ReactNode;
};

const BUTTON_VARIANT: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700",
  secondary: "bg-sunken text-ink hover:bg-line active:bg-line-strong",
  outline: "border border-line-strong bg-surface text-ink hover:bg-sunken active:bg-line",
  ghost: "text-ink-soft hover:bg-sunken active:bg-line",
  danger: "bg-brand-700 text-white hover:bg-brand-800 active:bg-brand-900",
};

const BUTTON_SIZE: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "min-h-11 px-3 text-sm gap-1.5",
  md: "min-h-12 px-4 text-[15px] gap-2",
  lg: "min-h-14 px-6 text-base gap-2.5",
};

export function Button({
  variant = "primary",
  size = "md",
  block = false,
  icon,
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={[
        "inline-flex items-center justify-center rounded-xl font-semibold transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-45",
        BUTTON_VARIANT[variant],
        BUTTON_SIZE[size],
        block ? "w-full" : "",
        className,
      ].join(" ")}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={`inline-flex size-11 items-center justify-center rounded-xl text-ink-soft transition-colors hover:bg-sunken active:bg-line disabled:opacity-45 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

/* ── กล่องและหัวข้อ ───────────────────────────────────────────────────────── */

export function Card({
  children,
  className = "",
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section
      className={`rounded-card border border-line bg-surface shadow-card ${padded ? "p-4" : ""} ${className}`}
    >
      {children}
    </section>
  );
}

export function SectionTitle({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-3">
      <h2 className="text-sm font-bold tracking-wide text-ink-soft uppercase">{children}</h2>
      {action}
    </div>
  );
}

/* ── ป้ายสถานะ ────────────────────────────────────────────────────────────── */

const TONE_BADGE: Record<Tone, string> = {
  neutral: "bg-sunken text-ink-soft",
  brand: "bg-brand-100 text-brand-700",
  ok: "bg-ok-100 text-ok-700",
  warn: "bg-warn-100 text-warn-700",
  info: "bg-info-100 text-info-700",
};

export function Badge({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${TONE_BADGE[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/* ── ฟอร์ม ───────────────────────────────────────────────────────────────── */

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-semibold">
        {label}
      </label>
      {hint ? <p className="text-xs leading-relaxed text-ink-faint">{hint}</p> : null}
      {children}
      {error ? (
        <p className="text-xs font-medium text-brand-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const CONTROL =
  "min-h-12 w-full rounded-xl border border-line-strong bg-surface px-3.5 text-[15px] " +
  "outline-none transition-colors placeholder:text-ink-faint focus:border-brand-400 disabled:opacity-50";

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${CONTROL} ${className}`} {...props} />;
}

export function Select({
  className = "",
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`${CONTROL} ${className}`} {...props}>
      {children}
    </select>
  );
}

/**
 * ตัวเพิ่ม-ลดจำนวน
 *
 * ใช้แทนช่องกรอกตัวเลขทุกที่ที่ค่ามักอยู่ในช่วงแคบ เช่นจำนวนคนหรือจำนวนจาน
 * เพราะการกดปุ่มเร็วและพลาดยากกว่าการพิมพ์ โดยเฉพาะบนมือถือกลางร้านที่เสียงดัง
 */
export function Stepper({
  value,
  onChange,
  min = 0,
  max = 99,
  label,
  size = "md",
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  label: string;
  size?: "md" | "lg";
}) {
  const box = size === "lg" ? "size-14" : "size-12";
  const text = size === "lg" ? "text-2xl w-14" : "text-lg w-10";
  return (
    <div className="inline-flex items-center gap-1.5">
      <button
        type="button"
        aria-label={`ลด${label}`}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        className={`${box} inline-flex items-center justify-center rounded-xl border border-line-strong bg-surface text-ink transition-colors hover:bg-sunken disabled:opacity-35`}
      >
        <IconMinus />
      </button>
      <output className={`tabular ${text} text-center font-bold`} aria-label={label}>
        {value}
      </output>
      <button
        type="button"
        aria-label={`เพิ่ม${label}`}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        className={`${box} inline-flex items-center justify-center rounded-xl bg-brand-500 text-white transition-colors hover:bg-brand-600 disabled:opacity-35`}
      >
        <IconPlus />
      </button>
    </div>
  );
}

/* ── สถานะของหน้าจอ ──────────────────────────────────────────────────────── */

export function Spinner({ label = "กำลังโหลด" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-12 text-sm text-ink-faint">
      <span
        className="size-4 animate-spin rounded-full border-2 border-line-strong border-t-brand-500"
        aria-hidden
      />
      {label}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-line-strong px-6 py-10 text-center">
      {icon ? <span className="text-ink-faint">{icon}</span> : null}
      <p className="font-semibold">{title}</p>
      {hint ? <p className="max-w-xs text-sm text-ink-faint">{hint}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

const TONE_NOTICE: Record<Tone, string> = {
  neutral: "border-line bg-sunken text-ink-soft",
  brand: "border-brand-200 bg-brand-50 text-brand-800",
  ok: "border-ok-100 bg-ok-50 text-ok-700",
  warn: "border-warn-100 bg-warn-50 text-warn-700",
  info: "border-info-100 bg-info-50 text-info-700",
};

export function Notice({
  tone = "neutral",
  icon,
  children,
}: {
  tone?: Tone;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      role="status"
      className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm leading-relaxed ${TONE_NOTICE[tone]}`}
    >
      {icon ? <span className="mt-0.5 shrink-0">{icon}</span> : null}
      <div>{children}</div>
    </div>
  );
}

/* ── ตัวเลขสรุป ──────────────────────────────────────────────────────────── */

export function Stat({
  label,
  value,
  unit,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  hint?: string;
  tone?: Tone;
}) {
  const accent: Record<Tone, string> = {
    neutral: "text-ink",
    brand: "text-brand-600",
    ok: "text-ok-500",
    warn: "text-warn-500",
    info: "text-info-500",
  };
  return (
    <Card>
      <p className="text-xs font-medium text-ink-faint">{label}</p>
      <p className={`tabular mt-1 text-3xl font-bold ${accent[tone]}`}>
        {value}
        {unit ? <span className="ml-1 text-base font-semibold">{unit}</span> : null}
      </p>
      {hint ? <p className="mt-1 text-xs text-ink-faint">{hint}</p> : null}
    </Card>
  );
}

/**
 * แถบเวลา — ใช้ทั้งฝั่งลูกค้าและฝั่งพนักงาน
 *
 * เปลี่ยนสีตามความเร่งด่วนและมีข้อความกำกับเสมอ เพื่อให้เห็นแต่ไกลว่าโต๊ะไหนใกล้หมดเวลา
 */
export function TimeBar({
  elapsed,
  duration,
  className = "",
}: {
  elapsed: number;
  duration: number;
  className?: string;
}) {
  const ratio = Math.min(1, Math.max(0, elapsed / duration));
  const over = elapsed > duration;
  const near = !over && duration - elapsed <= 15;
  const color = over ? "bg-brand-500" : near ? "bg-warn-500" : "bg-ok-500";

  return (
    <div
      className={`h-1.5 w-full overflow-hidden rounded-full bg-line ${className}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={duration}
      aria-valuenow={Math.min(elapsed, duration)}
      aria-label="เวลาที่ใช้ไป"
    >
      <div
        className={`h-full rounded-full transition-[width] duration-500 ${color}`}
        style={{ width: `${ratio * 100}%` }}
      />
    </div>
  );
}

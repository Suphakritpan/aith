import { useState, type FormEvent } from "react";
import { useAuth } from "../../lib/auth";
import { Button, Card, Field, Input, Notice } from "../../design/primitives";
import { IconAlert } from "../../design/icons";

// หน้าล็อกอินของพนักงาน
//
// ใช้แค่อีเมลกับรหัสผ่าน ไม่มีสมัครสมาชิกในหน้านี้ เพราะบัญชีพนักงานต้องให้ร้านเป็นคนเปิด
// การเลื่อนบทบาทเป็นหัวหน้ากะหรือเจ้าของร้านทำด้วย SQL โดยเจตนา ไม่เปิดให้ทำเองในแอป

export default function LoginPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "เข้าสู่ระบบไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="text-3xl font-bold tracking-tight">หมากระทุปุ๊ป๊ะ</p>
          <p className="mt-1 text-sm text-ink-faint">ระบบพนักงานและหลังร้าน</p>
        </div>

        <Card>
          <form onSubmit={onSubmit} className="space-y-4">
            {error ? (
              <Notice tone="brand" icon={<IconAlert className="size-4" />}>
                {error}
              </Notice>
            ) : null}

            <Field label="อีเมล" htmlFor="email">
              <Input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="staff@example.com"
              />
            </Field>

            <Field label="รหัสผ่าน" htmlFor="password">
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>

            <Button type="submit" size="lg" block disabled={busy}>
              {busy ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}
            </Button>
          </form>
        </Card>

        <p className="mt-4 px-2 text-center text-xs leading-relaxed text-ink-faint">
          บัญชีพนักงานต้องให้ร้านเป็นผู้เปิดให้ หากเข้าไม่ได้ให้ติดต่อหัวหน้ากะ
        </p>
      </div>
    </div>
  );
}

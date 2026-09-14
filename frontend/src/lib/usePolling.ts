import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, getClockSkew } from "./api";

// หน้าลูกค้าใช้การถามซ้ำตามรอบ ไม่ใช่ Realtime
//
// เหตุผล: ลูกค้าไม่ได้ล็อกอิน จึงไม่มีตัวตนให้ RLS เทียบ และ Realtime ของ Supabase
// เคารพ RLS อยู่แล้ว ช่องทางนั้นจึงส่ง event ให้ลูกค้าไม่ได้เลย (ADR-06)
// การถามซ้ำทุกไม่กี่วินาทีจึงเป็นทางที่ตรงกับสถาปัตยกรรม ไม่ใช่ทางลัด

type PollState<T> = {
  data: T | null;
  error: ApiError | Error | null;
  loading: boolean;
  refresh: () => void;
};

export function usePolling<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  intervalMs: number,
  enabled = true,
): PollState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  // เก็บ fetcher ไว้ใน ref เพื่อไม่ให้ closure ใหม่ทุก render ไปรีเซ็ตตัวจับเวลา
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) return;

    const controller = new AbortController();
    let timer: number | undefined;
    let stopped = false;

    const run = async () => {
      try {
        const next = await fetcherRef.current(controller.signal);
        if (stopped) return;
        setData(next);
        setError(null);
      } catch (err) {
        if (stopped || controller.signal.aborted) return;
        // 410/401 แปลว่ามื้อจบแล้ว ถามซ้ำต่อไปก็ไม่มีประโยชน์ จึงหยุดวนทันที
        if (err instanceof ApiError && err.isGone) stopped = true;
        setError(err as Error);
      } finally {
        if (!stopped) {
          setLoading(false);
          timer = window.setTimeout(run, intervalMs);
        } else {
          setLoading(false);
        }
      }
    };

    void run();

    return () => {
      stopped = true;
      controller.abort();
      if (timer) window.clearTimeout(timer);
    };
  }, [intervalMs, enabled, tick]);

  return { data, error, loading, refresh };
}

/**
 * นาฬิกาที่เดินทุกวินาทีในเครื่อง ใช้กับตัวนับถอยหลังให้ลื่นโดยไม่ต้องยิง API
 * บวกชดเชยส่วนต่างจากนาฬิกาเซิร์ฟเวอร์ (จับจาก response ล่าสุด) กันเครื่องตั้งเวลาเพี้ยน
 * แล้วตัวนับกับยอดที่เซิร์ฟเวอร์คิดบิลจริงไม่ตรงกัน (BR-04)
 */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now() + getClockSkew());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now() + getClockSkew()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

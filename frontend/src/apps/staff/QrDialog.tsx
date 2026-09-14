import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Overlay } from "../../design/overlay";
import { Button, Notice } from "../../design/primitives";
import { useToast } from "../../design/toast";

// QR ประจำมื้อ — §04 ขั้นที่ 05
//
// QR ผูกกับ Visit ไม่ใช่โต๊ะ (BR-02) ปิดโต๊ะแล้ว token หมดอายุทันที
// จึงต้องพิมพ์ใบใหม่ทุกครั้งที่เปิดโต๊ะ ห้ามเอาสติกเกอร์ติดโต๊ะไว้ถาวร
// หน้านี้เลยเน้นปุ่มพิมพ์เป็นหลัก และมีลิงก์ให้คัดลอกเผื่อเครื่องพิมพ์เสีย

export default function QrDialog({
  open,
  onClose,
  token,
  tableNos,
}: {
  open: boolean;
  onClose: () => void;
  token: string | null;
  tableNos?: string | null;
}) {
  const toast = useToast();
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  const link = token ? `${window.location.origin}/t/${token}` : "";

  useEffect(() => {
    if (!token) {
      setDataUrl(null);
      return;
    }
    let active = true;
    void QRCode.toDataURL(`${window.location.origin}/t/${token}`, {
      width: 520,
      margin: 1,
      color: { dark: "#241715", light: "#ffffff" },
    }).then((url) => {
      if (active) setDataUrl(url);
    });
    return () => {
      active = false;
    };
  }, [token]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      toast.show("คัดลอกลิงก์แล้ว");
    } catch {
      toast.show("คัดลอกไม่สำเร็จ", "error");
    }
  }

  function print() {
    const win = window.open("", "_blank", "width=420,height=640");
    if (!win || !dataUrl) return;
    win.document.write(`
      <html lang="th"><head><meta charset="utf-8"><title>QR โต๊ะ ${tableNos ?? ""}</title>
      <style>
        body{font-family:system-ui,sans-serif;text-align:center;padding:24px}
        img{width:300px;height:300px}
        h1{font-size:20px;margin:8px 0}
        p{font-size:12px;color:#555;margin:4px 0}
      </style></head><body>
      <h1>โต๊ะ ${tableNos ?? ""}</h1>
      <img src="${dataUrl}" alt="QR" />
      <p>สแกนเพื่อดูเมนูและสั่งอาหาร</p>
      <p>หมากระทุปุ๊ป๊ะ · จำกัดเวลา 120 นาที</p>
      <script>window.onload=()=>{window.print();}<\/script>
      </body></html>`);
    win.document.close();
  }

  return (
    <Overlay
      open={open}
      onClose={onClose}
      title="QR สำหรับโต๊ะนี้"
      description={tableNos ? `โต๊ะ ${tableNos}` : undefined}
      footer={
        <div className="flex gap-2">
          <Button variant="outline" block onClick={() => void copyLink()}>
            คัดลอกลิงก์
          </Button>
          <Button block onClick={print} disabled={!dataUrl}>
            พิมพ์
          </Button>
        </div>
      }
    >
      <div className="space-y-4 text-center">
        {dataUrl ? (
          <img
            src={dataUrl}
            alt="QR สำหรับเปิดหน้าโต๊ะ"
            className="mx-auto size-60 rounded-xl border border-line"
          />
        ) : (
          <div className="mx-auto size-60 animate-pulse rounded-xl bg-sunken" />
        )}

        <Notice tone="warn">
          QR ใบนี้ใช้ได้เฉพาะมื้อนี้ ปิดโต๊ะเมื่อไหร่ลิงก์จะหมดอายุทันที
          ห้ามนำไปติดไว้ที่โต๊ะถาวร
        </Notice>

        <p className="tabular break-all rounded-lg bg-sunken px-3 py-2 text-xs text-ink-faint">
          {link}
        </p>
      </div>
    </Overlay>
  );
}

import { useCallback, useState } from "react";
import { usePolling } from "../../lib/usePolling";
import {
  addPackagePrice,
  fetchAddons,
  fetchPackagePrices,
  fetchPackages,
  updateAddon,
  updatePackageDuration,
} from "../../lib/adminQueries";
import { useAuth } from "../../lib/auth";
import { useToast } from "../../design/toast";
import { Overlay } from "../../design/overlay";
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  Notice,
  SectionTitle,
  Spinner,
  Stepper,
} from "../../design/primitives";
import { TIER_LABEL, type PaxTier } from "../../lib/types";
import { formatBaht } from "../../lib/format";
import { AdminPage } from "./AdminShell";

// แพ็กเกจ ราคา และรายการเสริม — §10
//
// การขึ้นราคาไม่ใช่การแก้ตัวเลขเดิม แต่เป็นการเพิ่มราคาใหม่ที่มีวันเริ่มใช้
// เพราะบิลของเมื่อวานต้องยังอธิบายได้ว่าทำไมคิดเท่านั้น ถ้าทับของเดิมประวัติจะหายไป
//
// ราคาที่ลูกค้าจ่ายจริงถูก snapshot ลง visit_pax ตอนเช็คอินอยู่แล้ว
// การแก้ที่นี่จึงมีผลกับโต๊ะที่เปิดหลังจากนี้เท่านั้น ไม่ย้อนไปแก้บิลที่เปิดค้างอยู่

const TIERS: PaxTier[] = ["ADULT", "CHILD", "TODDLER_FREE"];

export default function PackagesPage() {
  const { atLeast } = useAuth();
  const toast = useToast();
  const [priceTarget, setPriceTarget] = useState<PaxTier | null>(null);
  const [addonTarget, setAddonTarget] = useState<{
    addon_id: string;
    name: string;
    price: number;
  } | null>(null);

  // ราคาเป็นข้อมูลเงิน RLS จึงจำกัดการแก้ไว้ที่เจ้าของร้าน
  const canEditPrice = atLeast("OWNER");
  const canEditPackage = atLeast("SUPERVISOR");

  const fetcher = useCallback(async () => {
    const [packages, prices, addons] = await Promise.all([
      fetchPackages(),
      fetchPackagePrices(),
      fetchAddons(),
    ]);
    return { packages, prices, addons };
  }, []);

  const { data, loading, refresh } = usePolling(fetcher, 60_000);

  async function act(action: () => Promise<void>, message: string) {
    try {
      await action();
      toast.show(message);
      refresh();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "ทำรายการไม่สำเร็จ", "error");
    }
  }

  if (loading && !data) return <Spinner label="กำลังโหลดแพ็กเกจ" />;
  if (!data) return null;

  const pkg = data.packages[0];
  const today = new Date().toISOString().slice(0, 10);

  // ราคาที่มีผลตอนนี้ = แถวล่าสุดที่วันเริ่มใช้มาถึงแล้ว
  const currentPrice = (tier: PaxTier) =>
    data.prices
      .filter((p) => p.tier === tier && p.effective_from <= today)
      .sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0];

  const futurePrice = (tier: PaxTier) =>
    data.prices
      .filter((p) => p.tier === tier && p.effective_from > today)
      .sort((a, b) => a.effective_from.localeCompare(b.effective_from))[0];

  return (
    <AdminPage
      title="แพ็กเกจและราคา"
      subtitle={pkg ? `${pkg.name} · จำกัดเวลา ${pkg.duration_minutes} นาที` : undefined}
    >
      {!canEditPrice ? (
        <Notice tone="neutral">
          ราคาแก้ได้เฉพาะเจ้าของร้าน บัญชีนี้ดูได้อย่างเดียว
        </Notice>
      ) : null}

      <SectionTitle>ราคาต่อหัว</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-3">
        {TIERS.map((tier) => {
          const current = currentPrice(tier);
          const upcoming = futurePrice(tier);
          return (
            <Card key={tier}>
              <p className="text-sm text-ink-faint">{TIER_LABEL[tier]}</p>
              <p className="tabular mt-1 text-3xl font-bold">
                {current ? formatBaht(current.price) : "—"}
                <span className="ml-1 text-base font-semibold">฿</span>
              </p>
              {current ? (
                <p className="tabular mt-0.5 text-xs text-ink-faint">
                  ใช้ตั้งแต่ {current.effective_from}
                </p>
              ) : (
                <p className="mt-0.5 text-xs text-warn-500">ยังไม่ได้ตั้งราคา</p>
              )}

              {upcoming ? (
                <Badge tone="info" className="mt-2">
                  จะเป็น {formatBaht(upcoming.price)} ฿ วันที่ {upcoming.effective_from}
                </Badge>
              ) : null}

              {canEditPrice ? (
                <Button
                  size="sm"
                  variant="outline"
                  block
                  className="mt-3"
                  onClick={() => setPriceTarget(tier)}
                >
                  ตั้งราคาใหม่
                </Button>
              ) : null}
            </Card>
          );
        })}
      </div>

      <div className="mt-6">
        <SectionTitle>รายการเสริม</SectionTitle>
        <Card padded={false}>
          <ul className="divide-y divide-line">
            {data.addons.map((addon) => (
              <li
                key={addon.addon_id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div>
                  <p className="font-semibold">{addon.name}</p>
                  <p className="tabular text-sm text-ink-faint">
                    {formatBaht(addon.price)} ฿ ·{" "}
                    {addon.charge_basis === "PER_HEAD" ? "คิดต่อคน" : "คิดต่อโต๊ะ"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {addon.is_active ? (
                    <Badge tone="ok">เปิดขาย</Badge>
                  ) : (
                    <Badge tone="neutral">ปิด</Badge>
                  )}
                  {canEditPrice ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setAddonTarget({
                            addon_id: addon.addon_id,
                            name: addon.name,
                            price: Number(addon.price),
                          })
                        }
                      >
                        แก้ราคา
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          void act(
                            () => updateAddon(addon.addon_id, { is_active: !addon.is_active }),
                            addon.is_active ? "ปิดรายการเสริมแล้ว" : "เปิดขายแล้ว",
                          )
                        }
                      >
                        {addon.is_active ? "ปิด" : "เปิด"}
                      </Button>
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {pkg && canEditPackage ? (
        <div className="mt-6">
          <SectionTitle>ระยะเวลาแพ็กเกจ</SectionTitle>
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold">จำกัดเวลาต่อรอบ</p>
                <p className="text-xs text-ink-faint">
                  เกินเวลานี้คิดเต็มรอบใหม่ · โต๊ะที่เปิดไปแล้วใช้ค่าเดิมที่ snapshot ไว้
                </p>
              </div>
              <Stepper
                value={pkg.duration_minutes}
                onChange={(minutes) =>
                  void act(
                    () => updatePackageDuration(pkg.package_id, minutes),
                    `ตั้งเป็น ${minutes} นาทีแล้ว`,
                  )
                }
                min={30}
                max={240}
                label="นาที"
                size="lg"
              />
            </div>
          </Card>
        </div>
      ) : null}

      <PriceDialog
        tier={priceTarget}
        currentPrice={priceTarget ? Number(currentPrice(priceTarget)?.price ?? 0) : 0}
        onClose={() => setPriceTarget(null)}
        onSubmit={async (price, effectiveFrom) => {
          if (!priceTarget || !pkg) return;
          await act(
            () =>
              addPackagePrice({
                packageId: pkg.package_id,
                tier: priceTarget,
                price,
                effectiveFrom,
              }),
            `ตั้งราคา ${TIER_LABEL[priceTarget]} แล้ว`,
          );
          setPriceTarget(null);
        }}
      />

      <Overlay
        open={addonTarget !== null}
        onClose={() => setAddonTarget(null)}
        title={addonTarget ? `แก้ราคา ${addonTarget.name}` : "แก้ราคา"}
        footer={
          <Button
            block
            size="lg"
            onClick={() => {
              if (!addonTarget) return;
              void act(
                () => updateAddon(addonTarget.addon_id, { price: addonTarget.price }),
                "บันทึกราคาแล้ว",
              ).then(() => setAddonTarget(null));
            }}
          >
            บันทึก
          </Button>
        }
      >
        <Field
          label="ราคาต่อคน"
          htmlFor="addon_price"
          hint="มีผลกับโต๊ะที่เปิดหลังจากนี้ ไม่ย้อนไปแก้ของเดิม"
        >
          <Input
            id="addon_price"
            type="number"
            min={0}
            value={addonTarget?.price ?? 0}
            onChange={(e) =>
              setAddonTarget((prev) =>
                prev ? { ...prev, price: Number(e.target.value) } : prev,
              )
            }
          />
        </Field>
      </Overlay>
    </AdminPage>
  );
}

function PriceDialog({
  tier,
  currentPrice,
  onClose,
  onSubmit,
}: {
  tier: PaxTier | null;
  currentPrice: number;
  onClose: () => void;
  onSubmit: (price: number, effectiveFrom: string) => void;
}) {
  const [price, setPrice] = useState(String(currentPrice));
  const [from, setFrom] = useState(() => new Date().toISOString().slice(0, 10));

  const [seenTier, setSeenTier] = useState<PaxTier | null>(null);
  if (tier && seenTier !== tier) {
    setSeenTier(tier);
    setPrice(String(currentPrice));
  }

  return (
    <Overlay
      open={tier !== null}
      onClose={onClose}
      title={tier ? `ตั้งราคา ${TIER_LABEL[tier]}` : "ตั้งราคา"}
      description="เพิ่มราคาใหม่พร้อมวันเริ่มใช้ ราคาเดิมยังอยู่ในประวัติ"
      footer={
        <Button
          block
          size="lg"
          disabled={!(Number(price) >= 0)}
          onClick={() => onSubmit(Number(price), from)}
        >
          บันทึกราคาใหม่
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="ราคาต่อหัว (บาท)" htmlFor="price">
          <Input
            id="price"
            type="number"
            min={0}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </Field>

        <Field
          label="เริ่มใช้วันที่"
          htmlFor="from"
          hint="ตั้งเป็นวันในอนาคตได้ ระบบจะสลับไปใช้เองเมื่อถึงวันนั้น"
        >
          <Input
            id="from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </Field>

        {tier === "TODDLER_FREE" ? (
          <Notice tone="warn">
            เด็กเล็กที่ได้ฟรีต้องเป็นราคา 0 เท่านั้น ฐานข้อมูลมี constraint บังคับไว้
          </Notice>
        ) : null}
      </div>
    </Overlay>
  );
}

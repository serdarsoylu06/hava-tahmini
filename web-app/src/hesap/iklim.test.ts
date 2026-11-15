import { describe, expect, it } from "vitest";
import { referans } from "../referans";
import { BellekDepo } from "../veri/depo";
import { istemciOlustur } from "../veri/istemci";
import type { Deger } from "../veri/tipler";
import * as iklim from "./iklim";

type Sutunlar = Record<string, Deger[]>;
interface Senaryo {
  ad: string; bas: string; gun_sayisi: number;
  girdi: { temperature_2m_max: Deger[]; temperature_2m_min: Deger[]; precipitation_sum: Deger[] };
  son: { time: string[] } & Sutunlar;
  ort_ornek: { sira: number[]; deger: Deger[] };
  normaller: { anahtar: string[] } & Sutunlar;
  normal_al: { tarihler: string[]; max_ort: Deger[] };
  ayni_gun: { tarih: string; pencere: number; satirlar: { yil: number; max: Deger; min: Deger }[] }[];
  yillik: { yil: number[]; ort: number[]; sapma: number[]; egim: number; normal: number };
  aylik_yagis: ({ yil: number; son_var: boolean; ay: number[] } & Sutunlar)[];
}
const r = referans<{ bugun: string; senaryolar: Senaryo[]; sabitler: Record<string, unknown> }>("iklim");

/** Referans dosyası küçük kalsın diye tarihler saklanmaz: başlangıç gününden ardışık günler üretilir. */
function gunler(bas: string, n: number): string[] {
  const t0 = Date.parse(`${bas}T00:00:00Z`);
  return Array.from({ length: n }, (_, i) => new Date(t0 + i * 86_400_000).toISOString().slice(0, 10));
}

/** 10⁻⁹ içinde eşit; null yalnızca null ile eşleşir. */
function yakin(bulunan: Deger | undefined, beklenen: Deger | undefined, ad: string) {
  if (bulunan == null || beklenen == null) expect(bulunan ?? null, ad).toBe(beklenen ?? null);
  else expect(Math.abs(bulunan - beklenen), ad).toBeLessThan(1e-9 * Math.max(1, Math.abs(beklenen)));
}

describe("Python ile eşdeğerlik: iklim", () => {
  it("sabitler aynı", () => {
    expect({ ARSIV: iklim.ARSIV, BASLANGIC: iklim.BASLANGIC, NORMAL: [...iklim.NORMAL], GUNLUK: iklim.GUNLUK }).toEqual(r.sabitler);
  });

  for (const s of r.senaryolar) {
    describe(s.ad, () => {
      const a = iklim.iklimTablosu({ time: gunler(s.bas, s.gun_sayisi), ...s.girdi });
      const son = iklim.iklimTablosu(s.son);

      it("günlük ortalama (en yüksek + en düşük) / 2; biri eksikse eksik", () => {
        expect(a.gun).toHaveLength(s.gun_sayisi);
        s.ort_ornek.sira.forEach((i, k) => yakin(a.ort[i], s.ort_ornek.deger[k], `ort[${i}]`));
      });

      it("normaller: 365 gün × 8 değer aynı", () => {
        const n = iklim.normaller(a);
        expect(n.anahtar).toEqual(s.normaller.anahtar);
        expect(n.anahtar).toHaveLength(365);
        for (const ad of ["max_ort", "max_p10", "max_p90", "min_ort", "min_p10", "min_p90", "ort", "yagis"] as const) {
          n[ad].forEach((x, i) => yakin(x, s.normaller[ad]![i], `${ad} ${n.anahtar[i]}`));
        }
      });

      it("normalAl: 29 Şubat, 28 Şubat'ın normalini kullanır", () => {
        const n = iklim.normaller(a);
        iklim.normalAl(n, s.normal_al.tarihler).forEach((i, k) => yakin(n.max_ort[i], s.normal_al.max_ort[k], s.normal_al.tarihler[k]!));
        expect(iklim.normalAl(n, ["2028-02-29"])).toEqual(iklim.normalAl(n, ["2027-02-28"]));
      });

      it("ayniGunGecmisi: 5 tarih × 3 pencere", () => {
        expect(s.ayni_gun).toHaveLength(15);
        for (const k of s.ayni_gun) {
          const b = iklim.ayniGunGecmisi(a, k.tarih, k.pencere), ad = `${k.tarih} ±${k.pencere}`;
          expect(b.map((x) => x.yil), ad).toEqual(k.satirlar.map((x) => x.yil));
          b.forEach((x, i) => { yakin(x.max, k.satirlar[i]!.max, `${ad} ${x.yil} max`); yakin(x.min, k.satirlar[i]!.min, `${ad} ${x.yil} min`); });
        }
      });

      it("yillik: tam yıllar, sapma, normal ve ısınma eğilimi", () => {
        const y = iklim.yillik(a);
        expect(y.yil).toEqual(s.yillik.yil);
        y.ort.forEach((x, i) => yakin(x, s.yillik.ort[i], `ort ${y.yil[i]}`));
        y.sapma.forEach((x, i) => yakin(x, s.yillik.sapma[i], `sapma ${y.yil[i]}`));
        yakin(y.normal, s.yillik.normal, "normal");
        yakin(y.egim, s.yillik.egim, "egim");
      });

      it("aylikYagis: bu yıl, geçen yıl ve arşivdeki eski bir yıl", () => {
        for (const k of s.aylik_yagis) {
          const b = iklim.aylikYagis(a, k.son_var ? son : null, k.yil, r.bugun), ad = `${k.yil} son=${k.son_var}`;
          expect(b.ay, ad).toEqual(k.ay);
          b.normal.forEach((x, i) => yakin(x, k.normal![i], `${ad} normal ${b.ay[i]}`));
          b.bu_yil.forEach((x, i) => yakin(x, k.bu_yil![i], `${ad} bu_yil ${b.ay[i]}`));
        }
      });
    });
  }
});

describe("iklim verisinin indirilmesi", () => {
  const yanit = { daily: { time: ["2026-10-30", "2026-10-31"], temperature_2m_max: [14, 15], temperature_2m_min: [4, null], precipitation_sum: [0, 1.2] } };

  it("arşiv ayda bir indirilir: 0,1° yuvarlanmış konum, geçen ayın sonuna kadar, 62 gün saklanır", async () => {
    let an = new Date("2026-11-14T10:00:00Z");
    const istekler: string[] = [];
    const depo = new BellekDepo();
    const ist = istemciOlustur({ depo, simdi: () => an,
      fetch: (async (u: RequestInfo | URL) => { istekler.push(String(u)); return new Response(JSON.stringify(yanit)); }) as typeof fetch });
    const a = await iklim.arsiv(ist, { lat: 39.9199, lon: 32.8543 }, an);
    expect(a).toEqual({ gun: ["2026-10-30", "2026-10-31"], max: [14, 15], min: [4, null], yagis: [0, 1.2], ort: [9, null] });
    expect(Object.fromEntries(new URL(istekler[0]!).searchParams)).toEqual({
      latitude: "39.9", longitude: "32.9", start_date: "1991-01-01", end_date: "2026-10-31", daily: iklim.GUNLUK, timezone: "auto" });
    an = new Date("2026-11-29T10:00:00Z");                                     // 15 gün sonra, yakın bir konum
    await iklim.arsiv(ist, { lat: 39.93, lon: 32.86 }, an);
    expect(istekler).toHaveLength(1);                                          // aynı ay, aynı ızgara: önbellekten
    expect(await depo.anahtarlar()).toHaveLength(1);
    an = new Date("2026-12-01T10:00:00Z");
    await iklim.arsiv(ist, { lat: 39.93, lon: 32.86 }, an);
    expect(istekler).toHaveLength(2);                                          // yeni ay: yeniden indirilir
    expect(new URL(istekler[1]!).searchParams.get("end_date")).toBe("2026-11-30");
  });

  it("arşiv alınamazsa null döner, sayfa durmaz", async () => {
    const ist = istemciOlustur({ depo: new BellekDepo(), fetch: (async () => { throw new TypeError("Failed to fetch"); }) as typeof fetch });
    expect(await iklim.arsiv(ist, { lat: 39.9, lon: 32.9 })).toBeNull();
    expect(await iklim.sonGunler(ist, { ad: "x", lat: 39.9, lon: 32.9, tz: "Europe/Istanbul", rakim: null, bolge: "" })).toBeNull();
  });
});

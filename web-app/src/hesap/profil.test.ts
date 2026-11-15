import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { capeCin, donmaSeviyesi, doymaBuharBasinci, kesisimler, lambertWm1, lcl, parselProfili, profilKur, profilOzeti, standartYukseklik, yagisaDonusebilirSu } from "./profil";

interface Kayit { ad: string; satir: Record<string, number | null>; p: number[]; T: number[]; Td: number[]; u: number[]; v: number[]; parsel: number[];
                  lcl_p: number; lcl_t: number; cape: number; cin: number; pw: number; donma: number | null; lcl_m: number; donma_m: number | null }
const REF = JSON.parse(readFileSync(new URL("../../referans/profil.json", import.meta.url), "utf8")) as Kayit[];

/** Dizilerin en büyük mutlak farkı. */
const enBuyukFark = (a: readonly number[], b: readonly number[]) => Math.max(...a.map((x, i) => Math.abs(x - b[i]!)));

describe("MetPy ile eşdeğerlik (referans/profil.json)", () => {
  it("referansta kararlı, kararsız, kapaklı ve dağ profilleri var", () => {
    expect(REF.length).toBeGreaterThanOrEqual(20);
    expect(REF.some((k) => k.cape > 3000)).toBe(true);
    expect(REF.some((k) => k.cin < -50)).toBe(true);
    expect(REF.some((k) => k.cape === 0)).toBe(true);
    expect(new Set(REF.map((k) => k.p.length)).size).toBeGreaterThanOrEqual(3);
  });

  for (const k of REF) {
    describe(k.ad, () => {
      const pr = profilKur((ad) => k.satir[ad])!;
      it("profil: basınç, sıcaklık, çiy noktası, rüzgâr", () => {
        expect(pr.p).toEqual(k.p);
        expect(pr.T).toEqual(k.T);
        expect(enBuyukFark(pr.Td, k.Td)).toBeLessThan(1e-9);
        expect(enBuyukFark(pr.u, k.u)).toBeLessThan(1e-9);
        expect(enBuyukFark(pr.v, k.v)).toBeLessThan(1e-9);
      });
      it("bulut tabanı (LCL)", () => {
        const b = lcl(k.p[0]!, k.T[0]!, k.Td[0]!);
        expect(Math.abs(b.p - k.lcl_p)).toBeLessThan(1e-7);
        expect(Math.abs(b.T - k.lcl_t)).toBeLessThan(1e-8);
      });
      it("parsel profili (0,001 °C içinde)", () => {
        expect(enBuyukFark(parselProfili(k.p, k.T[0]!, k.Td[0]!), k.parsel)).toBeLessThan(1e-3);
      });
      it("CAPE ve CIN (MetPy'nin parsel profiliyle: 1e-6 J/kg; kendi profilimizle: 0,05 J/kg)", () => {
        const metpyParseliyle = capeCin(k.p, k.T, k.Td, k.parsel);
        expect(Math.abs(metpyParseliyle.cape - k.cape)).toBeLessThan(1e-6);
        expect(Math.abs(metpyParseliyle.cin - k.cin)).toBeLessThan(1e-6);
        const o = profilOzeti(pr);
        expect(Math.abs(o.cape - k.cape)).toBeLessThan(0.05);
        expect(Math.abs(o.cin - k.cin)).toBeLessThan(0.05);
      });
      it("yağışa dönüşebilir su, donma seviyesi ve yükseklikler", () => {
        const o = profilOzeti(pr);
        expect(Math.abs(o.pw - k.pw)).toBeLessThan(1e-9);
        expect(Math.abs(o.lclM - k.lcl_m)).toBeLessThan(1e-5);
        if (k.donma == null) { expect(o.donma).toBeNull(); expect(o.donmaM).toBeNull(); }
        else { expect(Math.abs(o.donma! - k.donma)).toBeLessThan(1e-9); expect(Math.abs(o.donmaM! - k.donma_m!)).toBeLessThan(1e-6); }
      });
    });
  }
});

describe("yardımcılar", () => {
  it("Lambert W₋₁: w·eʷ = x ve w ≤ −1", () => {
    for (const x of [-0.3678, -0.3, -0.2, -0.1, -0.01, -1e-6]) {
      const w = lambertWm1(x);
      expect(w).toBeLessThanOrEqual(-1);
      expect(Math.abs(w * Math.exp(w) - x)).toBeLessThan(1e-13 * Math.max(1, Math.abs(x) * 1e3));
    }
    expect(lambertWm1(0.1)).toBeNaN();
    expect(lambertWm1(-0.5)).toBeNaN();
  });
  it("doyma buhar basıncı üçlü noktada 611,2 Pa", () => {
    expect(doymaBuharBasinci(273.16)).toBeCloseTo(611.2, 10);
    expect(doymaBuharBasinci(293.15)).toBeGreaterThan(2300);
    expect(doymaBuharBasinci(293.15)).toBeLessThan(2360);
  });
  it("kesişimler: yön süzgeci ve logaritmik ara değer", () => {
    const x = [1000, 900, 800, 700], a = [1, 3, 1, -1], b = [2, 2, 2, 2];
    expect(kesisimler(x, a, b, "artan", false)).toEqual([[950, 2]]);
    expect(kesisimler(x, a, b, "azalan", false)).toEqual([[850, 2]]);
    expect(kesisimler(x, a, b, "hepsi", false)).toHaveLength(2);
    expect(kesisimler(x, a, b, "artan", true)[0]![0]).toBeCloseTo(Math.sqrt(1000 * 900), 9);
    expect(kesisimler(x, [1, 1, 1, 1], b, "hepsi", false)).toEqual([]);
  });
  it("kesişimler: eğri tam sıfıra değdiğinde nokta bir kez sayılır", () => {
    expect(kesisimler([4, 3, 2, 1], [1, 0, -1, -2], [0, 0, 0, 0], "hepsi", false)).toEqual([[3, 0]]);
  });
  it("standart atmosfer: 1013,25 hPa → 0 m, 500 hPa ≈ 5,57 km", () => {
    expect(standartYukseklik(1013.25)).toBeCloseTo(0, 9);
    expect(standartYukseklik(500)).toBeGreaterThan(5500);
    expect(standartYukseklik(500)).toBeLessThan(5650);
  });
  it("donma seviyesi: yer donmuşsa ya da yukarıda donma yoksa null", () => {
    expect(donmaSeviyesi([1000, 850, 700], [10, 2, -6])).toBeCloseTo(850 - (2 / 8) * 150, 9);
    expect(donmaSeviyesi([1000, 850], [-1, -5])).toBeNull();
    expect(donmaSeviyesi([1000, 850], [10, 5])).toBeNull();
  });
  it("profilKur: yer değeri eksikse null, eksik seviye atlanır, yerin altındaki seviyeler alınmaz", () => {
    const satir: Record<string, number | null> = { surface_pressure: 930, temperature_2m: 10, dew_point_2m: 5, wind_speed_10m: 10, wind_direction_10m: 270 };
    for (const s of [1000, 925, 850, 700]) Object.assign(satir, { [`temperature_${s}hPa`]: 5, [`relative_humidity_${s}hPa`]: 50, [`wind_speed_${s}hPa`]: 20, [`wind_direction_${s}hPa`]: 180 });
    satir.relative_humidity_850hPa = null;
    const pr = profilKur((ad) => satir[ad])!;
    expect(pr.p).toEqual([930, 925, 700]);
    expect(pr.u[0]).toBeCloseTo(10 / 1.852, 9);                        // batıdan esen rüzgâr doğuya gider
    expect(pr.v[1]).toBeCloseTo(20 / 1.852, 9);                        // güneyden esen rüzgâr kuzeye gider
    expect(profilKur((ad) => (ad === "dew_point_2m" ? null : satir[ad]))).toBeNull();
  });
  it("yağışa dönüşebilir su basınç sırasından bağımsızdır", () => {
    expect(yagisaDonusebilirSu([1000, 850, 700], [15, 5, -5])).toBeCloseTo(yagisaDonusebilirSu([700, 1000, 850], [-5, 15, 5]), 12);
  });
});

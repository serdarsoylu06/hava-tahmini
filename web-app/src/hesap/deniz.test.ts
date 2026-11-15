import { describe, expect, it } from "vitest";
import { referans } from "../referans";
import type { Istemci, Parametre } from "../veri/istemci";
import { DENIZ } from "../veri/openMeteo";
import type { Deger, GunlukTablo, Tablo } from "../veri/tipler";
import * as deniz from "./deniz";
import type { Uyari } from "./yorum";

type Sonuc = { zaman: string[] } & Record<string, (number | boolean | null)[]>;
interface Ref {
  ay: { t: string; yas: number; simge: string; ad: string; aydinlanma: number }[];
  guvenlik: { ad: string; d: Tablo; hava: Tablo; deniz_yonu: number | null; sonuc: Sonuc }[];
  pencereler: { zaman: string[]; maske: boolean[]; en_az: number; sonuc: [string, string][] }[];
  balik: { ad: string; d: Tablo; hava: Tablo; gunluk: GunlukTablo; sonuc: Sonuc }[];
  uyarilar: { ad: string; d: Tablo; gun: number; uyarilar: Uyari[] }[];
  en_yakin: { kural: string; lat: number; lon: number; istek_nokta_sayilari: number[]; sonuc: deniz.DenizNoktasi | null }[];
  sabitler: { DENIZ_SAATLIK: string; SEVIYE_AD: string[]; SEVIYE_RENK: string[]; SINODIK: number };
}
const r = referans<Ref>("deniz");

/** Sayı dizileri 10⁻⁹ içinde aynı mı? null yalnızca null ile eşleşir. */
function yakin(bulunan: readonly (Deger | boolean)[], beklenen: readonly (number | boolean | null)[], ad: string) {
  expect(bulunan.length, ad).toBe(beklenen.length);
  bulunan.forEach((x, i) => {
    const b = beklenen[i]!;
    if (typeof x === "number" && typeof b === "number") expect(Math.abs(x - b), `${ad}[${i}]`).toBeLessThan(1e-9);
    else expect(x, `${ad}[${i}]`).toBe(b);
  });
}

describe("Python ile eşdeğerlik: deniz", () => {
  it("sabitler aynı", () => {
    expect({ DENIZ_SAATLIK: deniz.DENIZ_SAATLIK, SEVIYE_AD: [...deniz.SEVIYE_AD], SEVIYE_RENK: [...deniz.SEVIYE_RENK], SINODIK: deniz.SINODIK })
      .toEqual(r.sabitler);
  });

  it("ay: 140 zamanda yaş, evre ve aydınlanma aynı", () => {
    expect(new Set(r.ay.map((a) => a.ad)).size).toBe(8);
    for (const a of r.ay) {
      const b = deniz.ay(a.t);
      expect([b.simge, b.ad], a.t).toEqual([a.simge, a.ad]);
      expect(Math.abs(b.yas - a.yas), a.t).toBeLessThan(1e-9);
      expect(Math.abs(b.aydinlanma - a.aydinlanma), a.t).toBeLessThan(1e-9);
    }
  });

  for (const k of r.guvenlik) {
    it(`guvenlik — ${k.ad}`, () => {
      const s = deniz.guvenlik(k.d, k.hava, k.deniz_yonu);
      expect(s.zaman).toEqual(k.sonuc.zaman);
      for (const ad of ["dalga", "ruzgar", "gorus", "firtina", "kara_ruzgari", "genel"] as const) expect(s[ad], ad).toEqual(k.sonuc[ad]);
    });
  }

  it("pencereler: 12 maskede aynı başlangıç ve bitişler", () => {
    expect(r.pencereler.length).toBe(12);
    for (const p of r.pencereler) expect(deniz.pencereler(p.zaman, p.maske, p.en_az)).toEqual(p.sonuc);
  });

  for (const k of r.balik) {
    it(`balikGostergesi — ${k.ad}`, () => {
      const g = deniz.balikGostergesi(k.d, k.hava, k.gunluk);
      expect(g.zaman).toEqual(k.sonuc.zaman);
      for (const ad of ["alacakaranlik", "ay_konumu", "ay_evresi", "basinc", "ruzgar", "toplam", "dp"] as const) yakin(g[ad], k.sonuc[ad]!, ad);
    });
  }

  for (const k of r.uyarilar) {
    it(`denizUyarilari — ${k.ad}`, () => expect(deniz.denizUyarilari(k.d, k.gun)).toEqual(k.uyarilar));
  }

  it("enYakinDeniz: aynı nokta, mesafe, yön ve aynı sayıda istek", async () => {
    const kurallar: Record<string, (a: number, b: number) => boolean> = {
      kuzey: (a) => a > 41.0, hic: () => false, hep: () => true, dogu: (_, b) => b > 30.0,
      ada: (a, b) => !(Math.abs(a - 40.0) < 0.2 && Math.abs(b - 29.0) < 0.2),
    };
    for (const k of r.en_yakin) {
      const istekler: number[] = [];
      const istemci: Istemci = {
        async getir<T>(url: string, params: Parametre) {
          expect(url).toBe(DENIZ);
          expect(params).toMatchObject({ hourly: "wave_height", forecast_days: 1 });
          const lat = String(params.latitude).split(",").map(Number), lon = String(params.longitude).split(",").map(Number);
          istekler.push(lat.length);
          const liste = lat.map((a, i) => ({ hourly: { time: ["2026-11-14T00:00"], wave_height: [kurallar[k.kural]!(a, lon[i]!) ? 0.5 : null] } }));
          return { veri: (liste.length > 1 ? liste : liste[0]) as T, bilgi: { donem: "x", kaynak: "ag" as const } };
        },
      };
      const s = await deniz.enYakinDeniz(istemci, k.lat, k.lon);
      const ad = `${k.kural} ${k.lat},${k.lon}`;
      expect(istekler, ad).toEqual(k.istek_nokta_sayilari);
      if (k.sonuc === null) { expect(s, ad).toBeNull(); continue; }
      expect(s, ad).not.toBeNull();
      expect(Math.abs(s!.lat - k.sonuc.lat), ad).toBeLessThan(1e-9);
      expect(Math.abs(s!.lon - k.sonuc.lon), ad).toBeLessThan(1e-9);
      expect(Math.abs(s!.km - k.sonuc.km), ad).toBeLessThan(1e-9);
      if (k.sonuc.yon === null) expect(s!.yon, ad).toBeNull();
      else {
        const fark = Math.abs(s!.yon! - k.sonuc.yon);                 // 0° ile 360° aynı yöndür
        expect(Math.min(fark, 360 - fark), ad).toBeLessThan(1e-7);
      }
    }
  });
});

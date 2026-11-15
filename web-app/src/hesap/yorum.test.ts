import { describe, expect, it } from "vitest";
import { referans } from "../referans";
import type { Tablo } from "../veri/tipler";
import { ansamblGuveni, aralik, type GunlukSeri, type Uyari, uyarilar } from "./yorum";

interface Kayit { ad: string; tablo: Tablo; rakim: number | null; guven: GunlukSeri | null; uyarilar: Uyari[] }

describe("Python ile eşdeğerlik: uyarılar", () => {
  const kayitlar = referans<Kayit[]>("uyarilar");

  it("referans 13 uyarı türünün hepsini ve dört seviyeyi içerir", () => {
    const tum = kayitlar.flatMap((k) => k.uyarilar);
    expect(new Set(tum.map((u) => u.baslik)).size).toBe(13);
    expect(new Set(tum.map((u) => u.seviye))).toEqual(new Set(["tehlike", "dikkat", "bilgi", "iyi"]));
    expect(kayitlar.length).toBeGreaterThanOrEqual(36);
  });

  for (const k of kayitlar) {
    it(`${k.ad}: seviye, sıra ve bütün metinler aynı`, () => {
      expect(uyarilar(k.tablo, k.rakim, k.guven)).toEqual(k.uyarilar);
    });
  }

  it("aralik: blokların ilki ve kalan dönem sayısı", () => {
    for (const r of referans<{ zaman: string[]; maske: boolean[]; metin: string }[]>("aralik")) {
      expect(aralik(r.zaman, r.maske)).toBe(r.metin);
    }
  });

  it("ansamblGuveni: günlük en yüksek sıcaklıkta %10–%90 aralığı (10⁻⁹)", () => {
    for (const r of referans<{ ad: string; uyeler: Tablo; guven: GunlukSeri }[]>("ansambl_guveni")) {
      const g = ansamblGuveni(r.uyeler);
      expect(g.gun, r.ad).toEqual(r.guven.gun);
      g.deger.forEach((x, i) => expect(Math.abs(x! - r.guven.deger[i]!), `${r.ad} ${g.gun[i]}`).toBeLessThan(1e-9));
    }
  });
});

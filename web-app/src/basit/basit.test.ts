import { describe, expect, it } from "vitest";
import * as kayit from "../kabuk/kayit";
import { noktaOku, noktaYaz, yerOku, yerYaz } from "../ortak/url";
import type { Anlik, Tablo } from "../veri/tipler";
import { gorusAdi, gostergeler, gunesKonumu, gunEvresi, gunTuru, havaTuru, oneri, ozetCumle, ruzgarAdi, type Saat, saatler, sureYaz, uvDuzeyi } from "./metin";

const saat = (i: number, ek: Partial<Saat> = {}): Saat => ({
  zaman: `2026-11-${14 + Math.floor((22 + i) / 24)}T${String((22 + i) % 24).padStart(2, "0")}:00`, sicaklik: 12, hissedilen: 11, ciy: 4,
  olasilik: 0, ruzgar: 10, hamle: 20, basinc: 1018, kod: 1, gece: (22 + i) % 24 < 7 || (22 + i) % 24 >= 18, ...ek });
const dizi = (n: number, degistir: (i: number) => Partial<Saat> = () => ({})) => Array.from({ length: n }, (_, i) => saat(i, degistir(i)));
const anlik = (deger: Record<string, number | null>): Anlik => ({ zaman: "2026-11-14T22:00", deger });

describe("Basit mod metinleri", () => {
  it("hava türü ve gün türü", () => {
    expect([0, 2, 3, 45, 51, 63, 71, 86, 95, 99, null].map(havaTuru))
      .toEqual(["acik", "acik", "bulutlu", "sis", "yagmur", "yagmur", "kar", "kar", "firtina", "firtina", "acik"]);
    expect([0, 1, 2, 3, 48, 53, 57, 61, 75, 96].map(gunTuru))
      .toEqual(["acik", "acik", "parcali", "bulutlu", "sis", "hafif", "hafif", "yagmur", "kar", "firtina"]);
  });

  it("günün evresi: doğuş ve batımın 90 dakikası ayrı", () => {
    const evre = (s: string) => gunEvresi(`2026-11-14T${s}`, "2026-11-14T07:32", "2026-11-14T17:33");
    expect(["03:00", "07:31", "07:32", "09:01", "09:02", "16:02", "16:03", "17:32", "17:33", "22:00"].map(evre))
      .toEqual(["gece", "gece", "dogus", "dogus", "ogle", "ogle", "batim", "batim", "gece", "gece"]);
    expect(gunEvresi("2026-11-14T03:00", null, null)).toBe("ogle");
  });

  it("rüzgâr adları Beaufort sınırlarında değişir", () => {
    expect([0, 5.9, 6, 19.9, 20, 38.9, 39, 49.9, 50, 74.9, 75].map(ruzgarAdi)).toEqual(
      ["Sakin", "Sakin", "Hafif esinti", "Hafif esinti", "Orta rüzgâr", "Orta rüzgâr", "Kuvvetli rüzgâr", "Kuvvetli rüzgâr", "Sert rüzgâr", "Sert rüzgâr", "Fırtına"]);
  });

  it("özet: kuru hava", () => {
    expect(ozetCumle(dizi(36, (i) => ({ sicaklik: 12 - i * 0.2, gece: i < 9 }))))
      .toBe("Önümüzdeki saatler kuru; en yüksek 12°. Gece sıcaklık 10°’ye iniyor (Paz 06:00).");
  });

  it("özet: yağış, sis ve sert rüzgâr; en çok üç cümle", () => {
    const s = dizi(36, (i) => ({ olasilik: i === 6 ? 58 : i === 7 ? 80 : 10, gece: i < 9, sicaklik: i === 5 ? 8 : 12, kod: i === 12 ? 45 : 1, hamle: i === 20 ? 55 : 20 }));
    expect(ozetCumle(s)).toBe("Paz 04:00 civarında yağış olasılığı %80’e çıkıyor. Gece sıcaklık 8°’ye iniyor (Paz 03:00). Paz 10:00’ten itibaren sis olabilir.");
  });

  it("özet: eksik veriyle çökmez", () => {
    expect(ozetCumle(dizi(10, () => ({ sicaklik: null, olasilik: null, hamle: null, ciy: null, ruzgar: null, gece: false })))).toBe("Önümüzdeki saatler kuru.");
    expect(ozetCumle([])).toBe("Önümüzdeki saatler kuru.");
  });

  it("öneri: şemsiye, giyim, güneş kremi, rüzgâr", () => {
    expect(oneri(anlik({ apparent_temperature: 11, weather_code: 3, is_day: 0, uv_index: 0, wind_gusts_10m: 20 }), dizi(24, (i) => ({ olasilik: i === 3 ? 60 : 0 }))))
      .toBe("Şemsiye al; mont ya da kalın ceket iyi olur.");
    expect(oneri(anlik({ apparent_temperature: 30, weather_code: 0, is_day: 1, uv_index: 8, wind_gusts_10m: 55 }), dizi(24)))
      .toBe("Hafif giyin, yanına su al; güneş kremi sür; rüzgâr sert, açık alanda dikkat.");
    expect(oneri(anlik({ apparent_temperature: -2, weather_code: 73 }), dizi(24))).toBe("Kar yağıyor; kaymayan ayakkabı giy; kalın mont gerekir.");
    expect(oneri(anlik({ apparent_temperature: null }), dizi(24))).toBe("");
    expect(oneri(anlik({ apparent_temperature: 21 }), dizi(24))).toBe("Hava giyim açısından rahat.");
  });

  it("göstergeler: yağış, rüzgâr, nem, basınç düz dille", () => {
    const g = gostergeler(anlik({ temperature_2m: 13, dew_point_2m: 8, relative_humidity_2m: 69, wind_speed_10m: 7, wind_direction_10m: 225, pressure_msl: 1021 }),
                          dizi(24, (i) => ({ olasilik: i === 6 ? 58 : 5 })), 1022.4);
    expect(g.map((x) => [x.ad, x.deger, x.aciklama])).toEqual([
      ["Yağış", "%58", "En yüksek olasılık saat 04:00 civarında"],
      ["Rüzgâr", "7", "km/s · Hafif esinti, GB yönünden"],
      ["Nem", "%69", "Rahat"],
      ["Basınç", "1021", "hPa · düşüyor, hava bozabilir"],
    ]);
    expect(g[0]!.oran).toBeCloseTo(0.58);
    expect(g.every((x) => x.sesli.length > 0)).toBe(true);
  });

  it("göstergeler: eksik veri 0 gibi gösterilmez", () => {
    const g = gostergeler(anlik({}), dizi(24, () => ({ olasilik: null })), null);
    expect(g.map((x) => x.deger)).toEqual(["—", "—", "—", "—"]);
    expect(g.map((x) => x.aciklama)).toEqual(["Yağış olasılığı verisi yok", "Rüzgâr verisi yok", "Nem verisi yok", "Basınç verisi yok"]);
    const kuru = gostergeler(anlik({ temperature_2m: 13, dew_point_2m: 12, relative_humidity_2m: 95, pressure_msl: 1015 }), dizi(24), 1015.2);
    expect(kuru.map((x) => x.aciklama)).toEqual(["Önümüzdeki 24 saat kuru görünüyor", "Rüzgâr verisi yok", "Hava çok nemli; sis olabilir", "hPa · durağan"]);
  });

  it("saatler: tablodan dilim alır, eksik sütun ve taşan aralıkta çökmez", () => {
    const t: Tablo = { zaman: ["2026-11-14T22:00", "2026-11-14T23:00", "2026-11-15T00:00"],
                       sutun: { temperature_2m: [13, null, 12], is_day: [0, 0, 1], precipitation_probability: [5, 10, null] } };
    const s = saatler(t, 1, 24);
    expect(s.map((x) => [x.zaman.slice(11, 16), x.sicaklik, x.olasilik, x.gece, x.ruzgar])).toEqual([["23:00", null, 10, true, null], ["00:00", 12, null, false, null]]);
    expect(saatler(t, 5, 24)).toEqual([]);
  });
});

describe("kayıtlı yerler", () => {
  const sahte = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } }; };

  it("ekle, aynı adla değiştir, sil; depoya yazılır ve geri okunur", () => {
    const d = sahte();
    let l = kayit.ekle(d, [], "  Tirebolu açığı – lüfer  ", 41.02, 38.8);
    l = kayit.ekle(d, l, "Yayla", 40.6, 38.4);
    l = kayit.ekle(d, l, "Tirebolu açığı – lüfer", 41.05, 38.9);
    expect(l).toEqual([{ ad: "Tirebolu açığı – lüfer", lat: 41.05, lon: 38.9 }, { ad: "Yayla", lat: 40.6, lon: 38.4 }]);
    expect(kayit.oku(d)).toEqual(l);
    expect(kayit.bul(l, 40.605, 38.395)?.ad).toBe("Yayla");
    expect(kayit.bul(l, 40.7, 38.4)).toBeUndefined();
    expect(kayit.oku(d).length && kayit.sil(d, l, "Yayla")).toEqual([{ ad: "Tirebolu açığı – lüfer", lat: 41.05, lon: 38.9 }]);
  });

  it("en çok 15 nokta ve 40 karakter; boş ad eklenmez", () => {
    const d = sahte();
    let l: kayit.KayitliNokta[] = [];
    for (let i = 0; i < 20; i++) l = kayit.ekle(d, l, `Nokta ${i}`, 40 + i / 10, 30);
    expect(l).toHaveLength(15);
    expect(l[0]!.ad).toBe("Nokta 19");
    expect(kayit.ekle(d, l, "x".repeat(60), 1, 1)[0]!.ad).toHaveLength(40);
    expect(kayit.ekle(d, l, "   ", 1, 1)).toEqual(l);
  });

  it("bozuk ya da erişilemeyen depo boş liste verir", () => {
    expect(kayit.oku(null)).toEqual([]);
    expect(kayit.oku({ getItem: () => "{bozuk", setItem: () => {} })).toEqual([]);
    expect(kayit.oku({ getItem: () => JSON.stringify([{ ad: "iyi", lat: 1, lon: 2 }, { ad: "", lat: 1, lon: 2 }, { ad: "kötü", lat: 200, lon: 2 }, 5]), setItem: () => {} }))
      .toEqual([{ ad: "iyi", lat: 1, lon: 2 }]);
    expect(kayit.ekle({ getItem: () => null, setItem: () => { throw new Error("dolu"); } }, [], "a", 1, 2)).toEqual([{ ad: "a", lat: 1, lon: 2 }]);
  });
});

describe("?nokta= adres parametresi", () => {
  it("okuma: geçerli koordinat, bozuk ya da sınır dışı değer", () => {
    expect(noktaOku("?nokta=41.02,38.81")).toEqual({ lat: 41.02, lon: 38.81 });
    expect(noktaOku("?nokta=-33.87%2C151.21")).toEqual({ lat: -33.87, lon: 151.21 });
    expect([noktaOku(""), noktaOku("?nokta=abc"), noktaOku("?nokta=95,10"), noktaOku("?nokta=41.0"), noktaOku("?nokta=41,200")]).toEqual([null, null, null, null, null]);
  });

  it("yazma: yer ile nokta birbirinin yerini alır, diğer parametreler kalır", () => {
    const n = noktaYaz("?yer=Ankara&mod=uzman", 41.02345678, 38.8);
    expect(n).toBe("?mod=uzman&nokta=41.0235,38.8000");
    expect(noktaOku(n)).toEqual({ lat: 41.0235, lon: 38.8 });
    expect(yerOku(n)).toBeNull();
    const y = yerYaz(n, "Giresun");
    expect(noktaOku(y)).toBeNull();
    expect(yerOku(y)).toBe("Giresun");
  });
});

describe("Bugün şeridi", () => {
  it("UV basamakları", () => {
    expect([0, 2.9, 3, 5.9, 6, 7.9, 8, 10.9, 11].map(uvDuzeyi)).toEqual(["Düşük", "Düşük", "Orta", "Orta", "Yüksek", "Yüksek", "Çok yüksek", "Çok yüksek", "Aşırı"]);
  });
  it("görüş adları; sis sınırı 1 km", () => {
    expect([200, 999, 1000, 3999, 4000, 9999, 10000, 19999, 24140].map(gorusAdi)).toEqual(["Sis", "Sis", "Puslu", "Puslu", "Orta", "Orta", "İyi", "İyi", "Çok iyi"]);
  });
  it("gün uzunluğu", () => {
    expect(sureYaz("2026-11-15T07:13", "2026-11-15T17:07")).toBe("9 sa 54 dk");
    expect(sureYaz("2026-11-15T17:07", "2026-11-15T07:13")).toBeNull();
  });
  it("güneşin yeri: doğuşta 0, batışta 1, gece ve kutup gecesinde yok", () => {
    expect(gunesKonumu("2026-11-15T07:13", "2026-11-15T07:13", "2026-11-15T17:07")).toBe(0);
    expect(gunesKonumu("2026-11-15T12:10", "2026-11-15T07:13", "2026-11-15T17:07")).toBeCloseTo(0.5, 9);
    expect(gunesKonumu("2026-11-15T17:07", "2026-11-15T07:13", "2026-11-15T17:07")).toBe(1);
    expect(gunesKonumu("2026-11-15T21:00", "2026-11-15T07:13", "2026-11-15T17:07")).toBeNull();
    expect(gunesKonumu("2026-11-15T03:00", "2026-11-15T07:13", "2026-11-15T17:07")).toBeNull();
    expect(gunesKonumu("2026-11-15T12:00", null, null)).toBeNull();
  });
});

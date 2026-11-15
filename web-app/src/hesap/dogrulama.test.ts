import { describe, expect, it } from "vitest";
import type { Tablo } from "../veri/tipler";
import { enBuyukIska, gunlukToplam, hataOzeti, onceki, satirSec, temsilHatasi } from "./dogrulama";
import { VeriHatasi } from "../veri/istemci";
import { ARALIK_MS, iemKuyrugu } from "./iem";
import { olcumAyikla, yakinIstasyonlar } from "./olcum";

const tablo = (zaman: string[], sutun: Record<string, (number | null)[]>): Tablo => ({ zaman, sutun });

describe("hataOzeti", () => {
  const t = tablo(["a", "b", "c", "d"], {
    temperature_2m: [10, 12, null, 8],
    [onceki("temperature_2m", 1)]: [11, 11, 5, null],
    [onceki("temperature_2m", 2)]: [14, 9, 5, 8],
    [onceki("temperature_2m", 3)]: [null, null, null, null],
  });
  it("eksik çiftleri atlar, ortalama mutlak hata ve sapmayı verir", () => {
    const o = hataOzeti(t, "temperature_2m", 2);
    expect(o.map((x) => x.gun)).toEqual([1, 2]);                       // 3 gün önce: hiç çift yok
    expect(o[0]).toMatchObject({ mae: 1, sapma: 0, isabet: 100 });     // hatalar +1, −1
    expect(o[1]!.mae).toBeCloseTo((4 + 3 + 0) / 3, 12);
    expect(o[1]!.sapma).toBeCloseTo((4 - 3 + 0) / 3, 12);
    expect(o[1]!.isabet).toBeCloseTo(100 / 3, 12);                     // yalnızca 0 hatası eşik içinde
  });
  it("tolerans verilmezse eşik gerçekleşenin büyüklüğüne bağlıdır (2 + 0,25 × ortalama)", () => {
    const y = tablo(["a", "b"], { precipitation: [8, 0], [onceki("precipitation", 1)]: [11, 4] });
    expect(hataOzeti(y, "precipitation", null)[0]!.isabet).toBe(50);   // eşik 3: hata 3 içeride, 4 dışarıda
  });
});

describe("gunlukToplam", () => {
  it("günlere toplar, ilk günü atar, hepsi eksik günü eksik bırakır", () => {
    const t = tablo(["2026-11-01T22:00", "2026-11-02T00:00", "2026-11-02T01:00", "2026-11-03T00:00", "2026-11-03T01:00"],
                    { precipitation: [5, 1, 2.5, null, null], x: [1, null, 4, 2, null] });
    const g = gunlukToplam(t);
    expect(g.zaman).toEqual(["2026-11-02T00:00", "2026-11-03T00:00"]);
    expect(g.sutun.precipitation).toEqual([3.5, null]);
    expect(g.sutun.x).toEqual([4, 2]);
  });
});

describe("enBuyukIska, temsilHatasi, satirSec", () => {
  it("en büyük mutlak hatayı bulur", () => {
    const t = tablo(["a", "b", "c"], { v: [1, 5, 9], [onceki("v", 1)]: [2, 1, null] });
    expect(enBuyukIska(t, "v")).toEqual({ zaman: "b", tahmin: 1, gercek: 5 });
    expect(enBuyukIska(tablo(["a"], { v: [1], [onceki("v", 1)]: [1] }), "v")).toBeNull();
  });
  it("temsil hatası eksikleri atlar", () => {
    expect(temsilHatasi([10, null, 14], [9, 3, 16])).toEqual({ mae: 1.5, sapma: -0.5 });
    expect(temsilHatasi([null], [1])).toBeNull();
  });
  it("satır seçer", () => {
    expect(satirSec(tablo(["a", "b", "c"], { v: [1, 2, 3] }), (i) => i !== 1)).toEqual({ zaman: ["a", "c"], sutun: { v: [1, 3] } });
  });
});

describe("olcumAyikla", () => {
  const csv = ["station,valid,tmpf,dwpf,sknt,gust,alti,mslp",
               "LTAC,2026-11-13 00:50,50.00,46.40,10.00,M,30.12,M",
               "LTAC,2026-11-13 01:20,51.80,46.40,9.00,M,30.12,M",          // tam saate uzak: atlanır
               "LTAC,2026-11-13 01:50,48.20,M,4.00,20.00,30.09,M",
               "LTAC,2026-11-13 02:05,M,M,M,M,M,M",                          // hiç ölçüm yok: atlanır
               "LTAC,2026-11-13 23:50,32.00,30.20,0.00,M,29.92,M"].join("\n");
  it("birimleri çevirir ve en yakın saate yazar", () => {
    const t = olcumAyikla(csv)!;
    expect(t.zaman).toEqual(["2026-11-13T01:00", "2026-11-13T02:00", "2026-11-14T00:00"]);
    expect(t.sutun.temperature_2m).toEqual([10, 9, 0]);
    expect(t.sutun.dew_point_2m).toEqual([8, null, -1]);
    expect(t.sutun.wind_speed_10m).toEqual([18.5, 7.4, 0]);
    expect(t.sutun.wind_gusts_10m).toEqual([null, 37, null]);
    expect(t.sutun.pressure_msl).toEqual([1020, 1019, 1013.2]);
  });
  it("çok istasyonlu yanıtta yalnızca istenen istasyonu alır", () => {
    const cok = "station,valid,tmpf\nLTAB,2026-11-13 00:50,50.00\nLTAC,2026-11-13 00:50,41.00\nLTAC,2026-11-13 01:50,M\n";
    expect(olcumAyikla(cok, "LTAC")!.sutun.temperature_2m).toEqual([5]);
    expect(olcumAyikla(cok, "LTAB")!.sutun.temperature_2m).toEqual([10]);
    expect(olcumAyikla(cok, "LTAD")).toBeNull();
  });
  it("veri yoksa null döner", () => {
    expect(olcumAyikla("station,valid,tmpf\n")).toBeNull();
    expect(olcumAyikla("")).toBeNull();
  });
});

describe("yakinIstasyonlar", () => {
  it("yakından uzağa sıralar, uzak istasyonları eler", () => {
    const liste = [{ icao: "UZAK", ad: "Uzak", lat: 41, lon: 28.8, rakim: 10 }, { icao: "LTAC", ad: "Esenboğa", lat: 40.128, lon: 32.995, rakim: 952 },
                   { icao: "LTAD", ad: "Etimesgut", lat: 39.95, lon: 32.689, rakim: null }];
    const l = yakinIstasyonlar(39.92, 32.85, 120, liste);
    expect(l.map((s) => s.icao)).toEqual(["LTAD", "LTAC"]);
    expect(l[0]!.km).toBeLessThan(20);
    expect(l[1]).toMatchObject({ ad: "Esenboğa", rakim: 952 });
    expect(yakinIstasyonlar(0, 0, 120, liste)).toEqual([]);
  });
  // IEM'in kendi listesinde bu iki meydanın koordinatları yer değiştirmişti: Giresun'da Hakkari'nin ölçümleri çıkıyordu
  it("depodaki listede Giresun'a en yakın meydan Ordu-Giresun'dur, Hakkari değil", () => {
    const giresun = yakinIstasyonlar(40.9128, 38.3895);
    expect(giresun[0]).toMatchObject({ icao: "LTCB", rakim: 5 });
    expect(giresun[0]!.km).toBeLessThan(40);
    expect(giresun.some((s) => s.icao === "LTCW")).toBe(false);
    expect(yakinIstasyonlar(37.57, 43.74)[0]!.icao).toBe("LTCW");                     // Hakkari → Yüksekova
    expect(yakinIstasyonlar(37.52, 42.46).some((s) => s.icao === "LTCV")).toBe(true);  // Şırnak
    expect(yakinIstasyonlar(39.92, 32.85).some((s) => s.icao === "LTCV")).toBe(false); // Ankara'nın yanında değil
  });
  it("liste biçimi: dört harfli kod, geçerli koordinat, tekrar yok", () => {
    const hepsi = yakinIstasyonlar(39, 35, 5000);
    expect(hepsi.length).toBeGreaterThan(70);
    expect(new Set(hepsi.map((s) => s.icao)).size).toBe(hepsi.length);
    expect(hepsi.every((s) => /^[A-Z0-9]{4}$/.test(s.icao) && Math.abs(s.lat) <= 90 && Math.abs(s.lon) <= 180 && s.ad.length > 0)).toBe(true);
  });
});

describe("iemKuyrugu", () => {
  /** Sahte saat: beklemeler gerçek zaman harcamaz, yalnızca saati ilerletir. */
  const kur = (yanitlar: ("ag" | "onbellek" | "sinir")[]) => {
    let saat = 1000;
    const beklemeler: number[] = [], istekZamani: number[] = [];
    const istemci = { getir: async () => {
      istekZamani.push(saat);
      const y = yanitlar.shift() ?? "ag";
      if (y === "sinir") throw new VeriHatasi("sinir", "İstek sınırı aşıldı", "429", 429);
      return { veri: "csv", bilgi: { donem: "d", kaynak: y } };
    } } as never;
    const getir = iemKuyrugu(() => saat, async (ms) => { beklemeler.push(ms); saat += ms; });
    return { getir, istemci, beklemeler, istekZamani };
  };
  it("ağ istekleri arasında en az ARALIK_MS bırakır", async () => {
    const k = kur(["ag", "ag", "ag"]);
    await Promise.all([k.getir(k.istemci, {}), k.getir(k.istemci, {}), k.getir(k.istemci, {})]);
    expect(k.istekZamani).toEqual([1000, 1000 + ARALIK_MS, 1000 + 2 * ARALIK_MS]);
  });
  it("önbellekten dönen yanıttan sonra beklemez", async () => {
    const k = kur(["onbellek", "ag"]);
    await k.getir(k.istemci, {}); await k.getir(k.istemci, {});
    expect(k.beklemeler).toEqual([]);
  });
  it("geri çevrilen isteği bekleyip yeniden dener; üçüncü kez de geri çevrilirse hatayı verir", async () => {
    const k = kur(["sinir", "ag"]);
    expect((await k.getir(k.istemci, {})).veri).toBe("csv");
    expect(k.beklemeler).toEqual([ARALIK_MS]);
    const k2 = kur(["sinir", "sinir", "sinir"]);
    await expect(k2.getir(k2.istemci, {})).rejects.toMatchObject({ tur: "sinir" });
    expect(k2.istekZamani).toHaveLength(3);
  });
  it("bir istek hata verse de sıradakiler çalışır", async () => {
    const k = kur(["sinir", "sinir", "sinir", "ag"]);
    const ilk = k.getir(k.istemci, {}).catch(() => "hata"), ikinci = k.getir(k.istemci, {});
    expect(await ilk).toBe("hata");
    expect((await ikinci).veri).toBe("csv");
  });
});

import { describe, expect, it } from "vitest";
import { referans } from "../referans";
import { BellekDepo } from "../veri/depo";
import { istemciOlustur } from "../veri/istemci";
import type { Deger, Tablo } from "../veri/tipler";
import * as analiz from "./analiz";
import { adimSaati, alanMeta, alanSec, type AlanMeta, ayniZaman, degiskenVar, DENIZ_ALANLARI, DENIZ_KAYNAGI, DENIZ_SICAKLIGI_ALANI, enYakinZaman, KOK, kosuYaz, metaDogrula, MODELLER, type ModelKodu, omAdresi, ufukSaati } from "./katmanlar";
import { DENIZ_KATMANLARI, KATMANLAR, TUM_KATMANLAR } from "./katmanMetinleri";

const yakin = (b: Deger | undefined, r: Deger | undefined, ad: string) => {
  if (b == null || r == null) expect(b ?? null, ad).toBe(r ?? null);
  else expect(Math.abs(b - r), ad).toBeLessThan(1e-9 * Math.max(1, Math.abs(r)));
};
const diziYakin = (b: readonly Deger[], r: readonly Deger[], ad: string) => { expect(b.length, ad).toBe(r.length); b.forEach((x, i) => yakin(x, r[i], `${ad}[${i}]`)); };

interface Ref {
  ara_deger: { girdi: Deger[]; sonuc: Deger[] }[];
  modeller: { ad: string; degisken: string; birim: string; esik: [number, number]; tablo: Tablo; seriler: Record<string, Deger[]>;
              fark: { zaman: string[]; deger: number[] }; durum: string; metin: string }[];
  ansambl: { ad: string; birim: string; uyeler: Tablo; p10: Deger[]; p90: Deger[]; ortanca: Deger[]; uye_sayisi: number;
             ortanca_araligi: string; ilk_gun: string; son_gun: string; kat: string }[];
  yagis: { ad: string; konum: string; esik: number; uyeler: Tablo | null; gun: string[]; olasilik: number[]; ortanca: number[]; en_cok: number[]; metin: string }[];
  meteogram: { ad: string; kod: string; ortak: Tablo; model: Tablo; birlesik: Tablo; ozet: analiz.MeteogramOzeti }[];
}
const r = referans<Ref>("analiz");

describe("Python ile eşdeğerlik: analiz paneli", () => {
  it("araDeger: pandas interpolate(limit=6) ile aynı", () => {
    expect(r.ara_deger).toHaveLength(6);
    r.ara_deger.forEach((k, i) => diziYakin(analiz.araDeger(k.girdi, 6), k.sonuc, `dizi ${i}`));
  });

  for (const k of r.modeller) {
    it(`modeller — ${k.ad}: seriler, fark ve uyum cümlesi`, () => {
      const s = analiz.modelSerileri(k.tablo, k.degisken);
      expect(s.map((x) => x.ad)).toEqual(Object.keys(k.seriler));
      for (const x of s) diziYakin(x.deger, k.seriler[x.ad]!, x.ad);
      const u = analiz.modelUyumu(k.tablo.zaman, s, k.birim, k.esik);
      expect(u.fark.zaman).toEqual(k.fark.zaman);
      diziYakin(u.fark.deger, k.fark.deger, "fark");
      expect([u.durum, u.metin]).toEqual([k.durum, k.metin]);
    });
  }

  it("modeller: referans hem uyumlu hem bozulan durumu, eksik modeli ve bütün değişkenleri içerir", () => {
    expect(new Set(r.modeller.map((k) => k.durum))).toEqual(new Set(["uyumlu", "bozuluyor"]));
    expect(new Set(r.modeller.map((k) => k.degisken)).size).toBe(Object.keys(analiz.KARSILASTIRMA_DEGISKENLERI).length);
    expect(r.modeller.some((k) => Object.keys(k.seriler).length === 5)).toBe(true);
    for (const [ad, d] of Object.entries(analiz.KARSILASTIRMA_DEGISKENLERI)) {
      const ornek = r.modeller.find((k) => k.ad.endsWith(`· ${ad}`))!;
      expect([d.degisken, d.birim, [...d.esik]]).toEqual([ornek.degisken, ornek.birim, ornek.esik]);
    }
  });

  it("üçten az model: karşılaştırma yapılmaz", () => {
    const iki = analiz.modelSerileri(r.modeller[0]!.tablo, "temperature_2m").slice(0, 2);
    expect(analiz.modelUyumu(r.modeller[0]!.tablo.zaman, iki, "°C", [2, 4]).durum).toBe("yetersiz");
  });

  for (const k of r.ansambl) {
    it(`ansambl — ${k.ad}: %10, ortanca, %90 ve özet kartları`, () => {
      const o = analiz.ansamblOzeti(k.uyeler, k.birim);
      diziYakin(o.p10, k.p10, "p10"); diziYakin(o.p90, k.p90, "p90"); diziYakin(o.ortanca, k.ortanca, "ortanca");
      expect([o.uyeSayisi, o.ortancaAraligi, o.ilkGun, o.sonGun, o.kat]).toEqual([k.uye_sayisi, k.ortanca_araligi, k.ilk_gun, k.son_gun, k.kat]);
    });
  }

  for (const k of r.yagis) {
    it(`yağış olasılığı — ${k.ad}`, () => {
      const uyeler = k.uyeler ?? r.yagis.find((x) => x.konum === k.konum && x.uyeler)!.uyeler!;
      const y = analiz.yagisOlasiligi(uyeler, k.esik);
      expect(y.gun).toEqual(k.gun);
      diziYakin(y.olasilik, k.olasilik, "olasılık");
      diziYakin(y.dagilim.map((d) => d.ortanca), k.ortanca, "ortanca");
      diziYakin(y.dagilim.map((d) => d.enCok), k.en_cok, "en çok");
      expect(y.metin).toBe(k.metin);
    });
  }

  for (const k of r.meteogram) {
    it(`meteogram — ${k.ad}: model seçimi ve özet kartları`, () => {
      const b = analiz.modelleBirlestir(k.ortak, k.model, k.kod);
      expect(b.zaman).toEqual(k.birlesik.zaman);
      expect(Object.keys(b.sutun)).toEqual(Object.keys(k.birlesik.sutun));
      for (const [ad, v] of Object.entries(b.sutun)) diziYakin(v, k.birlesik.sutun[ad]!, ad);
      expect(b.sutun.precipitation_probability).toEqual(k.ortak.sutun.precipitation_probability);   // modelde yok: ortak tahminden
      // model erken bittiğinde Python "+nan hPa" yazar; TypeScript bilinçli olarak "—" gösterir
      expect(analiz.meteogramOzeti(b)).toEqual({ ...k.ozet, basincDegisimi: k.ozet.basincDegisimi === "+nan hPa" ? "—" : k.ozet.basincDegisimi });
    });
  }
});

describe("harita katmanları ve ızgara dosyaları", () => {
  const meta: AlanMeta = { alan: "ecmwf_ifs025", kosu: "2026-11-14T12:00:00Z", degiskenler: ["temperature_2m", "pressure_msl", "wind_u_component_10m", "wind_v_component_10m", "precipitation"],
                           gecerlilik: ["2026-11-14T12:00Z", "2026-11-14T15:00Z", "2026-11-14T18:00Z", "2026-11-14T21:00Z", "2026-11-15T00:00Z", "2026-11-15T06:00Z"] };

  it("katman tanımları ve açıklamaları Streamlit'tekilerle birebir aynı", () => {
    const ref = referans<{ kod: string; ad: string; degisken: string; birim: string; izo: string | null; aralik: number | null; izo_ad: string | null; ruzgar: boolean; bak: string[] }[]>("harita_katmanlari");
    expect(KATMANLAR.map((k) => ({ kod: k.kod, ad: k.ad, degisken: k.degisken, birim: k.birim, izo: k.izo?.degisken ?? null, aralik: k.izo?.aralik ?? null,
                                   izo_ad: k.izo?.ad ?? null, ruzgar: k.oklar, bak: k.bak }))).toEqual(ref);
  });

  it("omAdresi: koşu klasörü ve geçerlilik dosyası (gerçek sunucudaki yol biçimi)", () => {
    expect(omAdresi(meta, "2026-11-14T21:00Z", "temperature_2m", { koyu: true }))
      .toBe(`${KOK}/ecmwf_ifs025/2026/11/14/1200Z/2026-11-14T2100.om?variable=temperature_2m&dark=true`);
    expect(omAdresi(meta, "2026-11-15T00:00Z", "pressure_msl", { kontur: 4 }))
      .toBe(`${KOK}/ecmwf_ifs025/2026/11/14/1200Z/2026-11-15T0000.om?variable=pressure_msl&contours=true&intervals=4`);
    expect(omAdresi(meta, "2026-11-14T15:00Z", "wind_speed_10m", { oklar: true })).toContain("variable=wind_speed_10m&arrows=true");
    // yumuşak renk geçişi ve birleşik alan: koşu ve zaman temel alandan, yoldaki alan adı birleşik alandan
    expect(omAdresi(meta, "2026-11-14T21:00Z", "temperature_2m", { koyu: true, yumusak: true, alanAdi: "dwd_icon_seamless" }))
      .toBe(`${KOK}/dwd_icon_seamless/2026/11/14/1200Z/2026-11-14T2100.om?variable=temperature_2m&dark=true&color_blend=true`);
    expect(MODELLER.icon.birlesik).toEqual({ dwd_icon: "dwd_icon_seamless" });
    expect(Object.keys(MODELLER.icon.birlesik!).every((a) => MODELLER.icon.alanlar.includes(a))).toBe(true);
    expect(MODELLER.ecmwf.birlesik).toBeUndefined();
  });
  it("ince ızgara listenin başına konunca yüzey değişkenleri ondan, üst seviyeler kaba ızgaradan okunur", () => {
    const ince: AlanMeta = { alan: MODELLER.ecmwf.ince!.alan, kosu: meta.kosu, degiskenler: ["temperature_2m", "pressure_msl", "precipitation"], gecerlilik: meta.gecerlilik };
    const kaba: AlanMeta = { ...meta, degiskenler: [...meta.degiskenler, "temperature_500hPa"] };
    expect(MODELLER.ecmwf.ince!.alan).toBe("ecmwf_ifs");
    expect(MODELLER.ecmwf.alanlar).not.toContain(MODELLER.ecmwf.ince!.alan);          // varsayılan olarak kapalı
    expect(alanSec([ince, kaba], "temperature_2m")).toBe(ince);
    expect(alanSec([ince, kaba], "temperature_500hPa")).toBe(kaba);
    expect(alanSec([ince, kaba].filter((x) => x.alan !== ince.alan), "pressure_msl")).toBe(kaba);   // çizgiler kaba ızgaradan
    expect(MODELLER.icon.ince).toBeUndefined();
    expect(MODELLER.gfs.ince).toBeUndefined();
    expect(omAdresi(meta, "2026-11-15T06:00Z", "precipitation")).toContain("delta_time_hours=6");
    expect(omAdresi(meta, "2026-11-14T12:00Z", "precipitation")).toContain("delta_time_hours=3");
    expect(omAdresi(meta, "2026-11-14T15:00Z", "temperature_2m")).not.toContain("delta_time_hours");
  });

  it("koşu zamanı ile geçerlilik zamanı ayrıdır: ufuk, adım ve en yakın zaman", () => {
    expect(ufukSaati(meta, "2026-11-15T06:00Z")).toBe(18);
    expect(ufukSaati(meta, "2026-11-14T12:00Z")).toBe(0);
    expect([adimSaati(meta, "2026-11-14T12:00Z"), adimSaati(meta, "2026-11-15T00:00Z"), adimSaati(meta, "2026-11-15T06:00Z"), adimSaati(meta, "2030-01-01T00:00Z")]).toEqual([3, 3, 6, null]);
    expect(enYakinZaman(meta, new Date("2026-11-14T19:40:00Z"))).toBe(3);
    expect(enYakinZaman(meta, new Date("2026-11-20T00:00:00Z"))).toBe(5);
    expect(enYakinZaman(meta, new Date("2026-11-01T00:00:00Z"))).toBe(0);
    expect(kosuYaz(meta.kosu)).toBe("14.11 12Z");
  });

  it("ayniZaman: iki alanın aynı ana ait dosyaları eşlenir, uzak zaman eşlenmez", () => {
    expect(ayniZaman(meta, "2026-11-14T21:00Z")).toBe("2026-11-14T21:00Z");
    expect(ayniZaman(meta, "2026-11-14T22:00Z")).toBe("2026-11-14T21:00Z");
    expect(ayniZaman(meta, "2026-11-15T03:00Z")).toBeNull();
  });

  it("alan seçimi: değişken ilk bulunduğu alandan okunur; türetilen rüzgâr bileşenlerden", () => {
    const gfs013: AlanMeta = { ...meta, alan: "ncep_gfs013", degiskenler: ["temperature_2m", "wind_u_component_10m", "wind_v_component_10m"] };
    const gfs025: AlanMeta = { ...meta, alan: "ncep_gfs025", degiskenler: ["pressure_msl", "wind_gusts_10m", "temperature_850hPa"] };
    expect(alanSec([gfs013, gfs025], "temperature_2m")?.alan).toBe("ncep_gfs013");
    expect(alanSec([gfs013, gfs025], "pressure_msl")?.alan).toBe("ncep_gfs025");
    expect(alanSec([gfs013, gfs025], "wind_speed_10m")?.alan).toBe("ncep_gfs013");
    expect(alanSec([gfs013, gfs025], "cloud_cover")).toBeNull();
    expect(degiskenVar(gfs025, "wind_speed_10m")).toBe(false);
    expect(Object.values(MODELLER).map((m) => m.api)).toEqual(["ecmwf_ifs", "icon_seamless", "gfs_seamless"]);
  });

  it("metaDogrula: bozuk koşu bilgisi reddedilir; zamanlar sıralanır", () => {
    const iyi = { reference_time: "2026-11-14T12:00:00Z", valid_times: ["2026-11-14T15:00Z", "2026-11-14T12:00Z"], variables: ["temperature_2m"], completed: true };
    expect(metaDogrula("x", iyi)).toEqual({ alan: "x", kosu: "2026-11-14T12:00:00Z", gecerlilik: ["2026-11-14T12:00Z", "2026-11-14T15:00Z"], degiskenler: ["temperature_2m"] });
    for (const bozuk of [null, {}, { ...iyi, reference_time: "dün" }, { ...iyi, valid_times: [] }, { ...iyi, valid_times: ["2026-11-14 12:00"] }, { ...iyi, variables: "hepsi" }]) {
      expect(() => metaDogrula("x", bozuk)).toThrow();
    }
  });

  it("alanMeta: koşu bilgisi saatte bir kez indirilir", async () => {
    const istekler: string[] = [];
    const ist = istemciOlustur({ depo: new BellekDepo(), simdi: () => new Date("2026-11-14T19:30:00Z"),
      fetch: (async (u: RequestInfo | URL) => { istekler.push(String(u)); return new Response(JSON.stringify({ reference_time: meta.kosu, valid_times: meta.gecerlilik, variables: meta.degiskenler })); }) as typeof fetch });
    expect((await alanMeta(ist, "ecmwf_ifs025")).gecerlilik).toHaveLength(6);
    await alanMeta(ist, "ecmwf_ifs025");
    expect(istekler).toEqual([`${KOK}/ecmwf_ifs025/latest.json`]);
  });
});

describe("deniz katmanları", () => {
  const dalga: AlanMeta = { alan: "ecmwf_wam025", kosu: "2026-11-15T06:00:00Z", degiskenler: ["wave_direction", "wave_height", "wave_peak_period", "wave_period"],
                            gecerlilik: ["2026-11-15T06:00Z", "2026-11-15T09:00Z", "2026-11-15T12:00Z"] };
  // deniz suyu sıcaklığının geçerlilik zamanları koşudan önce başlar (analiz günleri)
  const sst: AlanMeta = { alan: DENIZ_SICAKLIGI_ALANI, kosu: "2026-11-15T00:00:00Z", degiskenler: ["sea_surface_temperature"],
                          gecerlilik: ["2026-11-14T06:00Z", "2026-11-14T12:00Z", "2026-11-15T00:00Z", "2026-11-15T06:00Z"] };

  it("hava katmanlarının ardından gelir; kodlar benzersizdir ve deniz diye işaretlidir", () => {
    expect(TUM_KATMANLAR.slice(0, KATMANLAR.length)).toEqual(KATMANLAR);
    expect(DENIZ_KATMANLARI.map((k) => k.degisken)).toEqual(["wave_height", "sea_surface_temperature"]);
    expect(new Set(TUM_KATMANLAR.map((k) => k.kod)).size).toBe(TUM_KATMANLAR.length);
    expect(DENIZ_KATMANLARI.every((k) => k.deniz && !k.izo && !k.oklar && k.bak.length >= 3)).toBe(true);
    expect(KATMANLAR.some((k) => k.deniz)).toBe(false);
  });
  it("her modelin deniz alanları tanımlıdır, kaynağı bilinir ve su sıcaklığı alanını içerir", () => {
    for (const model of Object.keys(MODELLER) as ModelKodu[]) {
      const alanlar = DENIZ_ALANLARI[model];
      expect(alanlar.at(-1)).toBe(DENIZ_SICAKLIGI_ALANI);
      expect(alanlar.length).toBeGreaterThanOrEqual(2);
      for (const a of alanlar) expect(DENIZ_KAYNAGI[a]?.ad, a).toBeTruthy();
      expect(alanlar.some((a) => MODELLER[model].alanlar.includes(a))).toBe(false);       // hava alanlarıyla karışmaz
    }
  });
  it("dalga dalga modelinden, su sıcaklığı okyanus modelinden okunur", () => {
    expect(alanSec([dalga, sst], "wave_height")).toBe(dalga);
    expect(alanSec([dalga, sst], "sea_surface_temperature")).toBe(sst);
    expect(alanSec([dalga, sst], "temperature_2m")).toBeNull();
    expect(omAdresi(dalga, "2026-11-15T09:00Z", "wave_height", { koyu: true }))
      .toBe(`${KOK}/ecmwf_wam025/2026/11/15/0600Z/2026-11-15T0900.om?variable=wave_height&dark=true`);
  });
  it("koşudan önceki (analiz) zamanlarda ufuk eksi çıkar ve dosya yine koşunun klasöründedir", () => {
    expect(ufukSaati(sst, "2026-11-14T06:00Z")).toBe(-18);
    expect(omAdresi(sst, "2026-11-14T06:00Z", "sea_surface_temperature"))
      .toBe(`${KOK}/${DENIZ_SICAKLIGI_ALANI}/2026/11/15/0000Z/2026-11-14T0600.om?variable=sea_surface_temperature`);
    expect(sst.gecerlilik[enYakinZaman(sst, new Date("2026-11-14T13:10:00Z"))]).toBe("2026-11-14T12:00Z");
  });
});

describe("ansambl model seçimi", () => {
  it("kısa ad üye sayısını korur, uzun adı kısaltır", () => {
    expect(Object.keys(analiz.ANSAMBL_MODELLERI).map(analiz.kisaModelAdi)).toEqual(["ECMWF · 51", "AIFS · 51", "GFS · 31", "ICON · 40"]);
  });
  it("üye sayısı olmayan adı olduğu gibi bırakır", () => {
    expect(analiz.kisaModelAdi("Deneme modeli")).toBe("Deneme modeli");
  });
});

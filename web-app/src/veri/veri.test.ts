import { describe, expect, it } from "vitest";
import { referans } from "../referans";
import { BellekDepo } from "./depo";
import { anlikDogrula, gunlukDogrula, sayiyaCevir, tabloDogrula } from "./dogrula";
import { donem, donemEtiketi, gunDonemi, tazelik, TZ } from "./donem";
import { adres, anahtar, istemciOlustur, VeriHatasi } from "./istemci";
import * as om from "./openMeteo";
import type { Konum } from "./tipler";
import { yerelSaat } from "../ortak/zaman";
import { cokluAnlikAyikla } from "./openMeteo";

const ANKARA: Konum = { ad: "Ankara", lat: 39.9199, lon: 32.8543, tz: "Europe/Istanbul", rakim: 850, bolge: "Türkiye" };

/** Sahte ağ: sıradaki yanıtı döndürür, yapılan istekleri sayar. */
function sahteAg(yanitlar: (Response | Error | (() => Response | Promise<Response>))[]) {
  const istekler: string[] = [];
  const f = (async (girdi: RequestInfo | URL) => {
    istekler.push(String(girdi));
    const y = yanitlar[Math.min(istekler.length, yanitlar.length) - 1]!;
    if (y instanceof Error) throw y;
    return y instanceof Response ? y.clone() : y();
  }) as typeof fetch;
  return { f, istekler };
}
const json = (govde: unknown, durum = 200) => new Response(JSON.stringify(govde), { status: durum });

describe("Python ile eşdeğerlik: veri dönemi", () => {
  it("donem ve Türkiye saati, saat/gün/yıl sınırlarında Python ile aynı", () => {
    const r = referans<{ an: string; donem: string; simdi_tr: string }[]>("donem");
    expect(r.length).toBe(12);
    for (const { an, donem: d, simdi_tr } of r) {
      expect(donem(new Date(an)), an).toBe(d);
      expect(yerelSaat(new Date(an), TZ), an).toBe(simdi_tr);
    }
  });

  it("13:10–14:09 aynı dönem; günlük dönem; tazelik saatleri", () => {
    expect(donem(new Date("2026-11-04T10:10:00Z"))).toBe(donem(new Date("2026-11-04T11:09:59Z")));
    expect(donem(new Date("2026-11-04T11:10:00Z"))).toBe("2026-11-04T14");
    expect(gunDonemi(new Date("2026-11-04T21:09:00Z"))).toBe("2026-11-04");
    expect(gunDonemi(new Date("2026-11-04T21:10:00Z"))).toBe("2026-11-05");
    expect(tazelik(new Date("2026-11-04T10:30:00Z"))).toEqual({ alindi: "13:10", sonraki: "14:10" });
    expect(tazelik(new Date("2026-11-04T20:30:00Z"))).toEqual({ alindi: "23:10", sonraki: "00:10" });
    expect(donemEtiketi("2026-11-04T13")).toBe("2026-11-04 13:10");
    expect(donemEtiketi("2026-11-04")).toBe("2026-11-04");
  });
});

describe("Python ile eşdeğerlik: tablo ve şu andan başlatma", () => {
  const r = referans<{
    ham: Record<string, unknown[]>; tablo: Record<string, (number | null)[]>;
    simdiden: { an: string; tz: string; simdi: string; satir: number; ilk: string | null }[];
  }>("tablo_simdiden");

  it("tabloDogrula, pandas'ın sayıya çevirmesiyle aynı sonucu verir (eksik ve metin değerler null)", () => {
    const t = tabloDogrula(r.ham);
    expect(t.zaman).toEqual(r.ham.time);
    expect(t.sutun).toEqual(r.tablo);
  });

  it("simdiden, 6 saat diliminde ve 4 anda Python ile aynı satırdan başlar", () => {
    const t = tabloDogrula(r.ham);
    expect(r.simdiden.length).toBe(24);
    for (const s of r.simdiden) {
      const simdi = om.simdikiSaat(s.tz, new Date(s.an));
      expect(simdi, `${s.an} ${s.tz}`).toBe(s.simdi);
      const kalan = om.simdiden(t, simdi);
      expect(kalan.zaman.length).toBe(s.satir);
      expect(kalan.zaman[0] ?? null).toBe(s.ilk);
      for (const v of Object.values(kalan.sutun)) expect(v.length).toBe(s.satir);
    }
  });

  it("API sabitleri Python'dakilerle birebir aynı", () => {
    const s = referans<Record<string, unknown>>("sabitler");
    expect({ FC: om.FC, ENS: om.ENS, GEO: om.GEO, DENIZ: om.DENIZ, TZ, SEVIYELER: [...om.SEVIYELER],
             GUN_EN_COK: om.GUN_EN_COK, SAATLIK: om.SAATLIK, GUNLUK: om.GUNLUK, ANLIK: om.ANLIK })
      .toEqual({ FC: s.FC, ENS: s.ENS, GEO: s.GEO, DENIZ: s.DENIZ, TZ: s.TZ, SEVIYELER: s.SEVIYELER,
                 GUN_EN_COK: s.GUN_EN_COK, SAATLIK: s.SAATLIK, GUNLUK: s.GUNLUK, ANLIK: s.ANLIK });
  });
});

/** Biçim hatasının ayrıntısı (`neden`); hata fırlatılmazsa test düşer. */
function neden(is: () => unknown): string {
  try {
    is();
  } catch (e) {
    if (e instanceof VeriHatasi && e.tur === "bicim") return e.neden;
    throw e;
  }
  throw new Error("hata bekleniyordu");
}

describe("veri doğrulama", () => {
  it("sayiyaCevir: sayı olmayan her şey eksik veri", () => {
    expect([3, "3.5", " 7 ", "1e3", true].map(sayiyaCevir)).toEqual([3, 3.5, 7, 1000, 1]);
    expect([null, undefined, "", "yok", "0x10", Number.NaN, Infinity, {}, []].map(sayiyaCevir)).toEqual(Array(9).fill(null));
  });

  it("bozuk saatlik blok reddedilir", () => {
    expect(() => tabloDogrula(null)).toThrow(VeriHatasi);
    expect(neden(() => tabloDogrula({ time: ["2026-11-14"], a: [1] }))).toMatch(/time/);
    expect(neden(() => tabloDogrula({ time: ["2026-11-14T00:00", "2026-11-14T01:00"], a: [1] }))).toMatch(/uzunluğu/);
    expect(neden(() => tabloDogrula({ time: ["2026-11-14T00:00"], a: [1] }, ["a", "b"]))).toMatch(/eksik değişken: b/);
  });

  it("günlük ve anlık bloklar", () => {
    const g = gunlukDogrula({ time: ["2026-11-14", "2026-11-15"], temperature_2m_max: [17, null],
                              sunrise: ["2026-11-14T07:32", null], sunset: ["2026-11-14T17:33", null] });
    expect(g.gun).toHaveLength(2);
    expect(g.sutun).toEqual({ temperature_2m_max: [17, null] });
    expect(g.gunDogumu).toEqual(["2026-11-14T07:32", null]);
    expect(neden(() => gunlukDogrula({ time: ["2026-11-14"], sunrise: ["07:32"] }))).toMatch(/sunrise/);
    const a = anlikDogrula({ time: "2026-11-14T22:00", interval: 900, temperature_2m: 12.6, uv_index: null });
    expect(a).toEqual({ zaman: "2026-11-14T22:00", deger: { temperature_2m: 12.6, uv_index: null } });
    expect(neden(() => anlikDogrula({ time: "2026-11-14T22:00" }, ["temperature_2m"]))).toMatch(/eksik/);
  });
});

describe("istemci: önbellek ve hata yönetimi", () => {
  const URL_ = "https://ornek.test/v1/forecast";
  const P = { latitude: 39.92, longitude: 32.85, hourly: "temperature_2m" };

  it("adres ve anahtar: dizi parametre virgülle birleşir, anahtar sıradan bağımsız", () => {
    expect(adres(URL_, { a: 1, b: ["x", "y"] })).toBe(`${URL_}?a=1&b=x%2Cy`);
    expect(adres(URL_, {})).toBe(URL_);
    expect(anahtar(URL_, { b: 2, a: 1 })).toBe(anahtar(URL_, { a: 1, b: 2 }));
    expect(anahtar(URL_, { a: 1 })).not.toBe(anahtar(URL_, { a: 2 }));
  });

  it("aynı dönemde ikinci istek ağa çıkmaz; yeni dönemde çıkar", async () => {
    let an = new Date("2026-11-04T10:15:00Z");
    const ag = sahteAg([json({ n: 1 }), json({ n: 2 })]);
    const ist = istemciOlustur({ depo: new BellekDepo(), fetch: ag.f, simdi: () => an });
    expect(await ist.getir(URL_, P)).toEqual({ veri: { n: 1 }, bilgi: { donem: "2026-11-04T13", kaynak: "ag" } });
    an = new Date("2026-11-04T11:09:00Z");                       // 14:09: hâlâ aynı dönem
    expect(await ist.getir(URL_, P)).toEqual({ veri: { n: 1 }, bilgi: { donem: "2026-11-04T13", kaynak: "onbellek" } });
    expect(ag.istekler).toHaveLength(1);
    an = new Date("2026-11-04T11:10:00Z");                       // 14:10: yeni dönem
    expect(await ist.getir(URL_, P)).toEqual({ veri: { n: 2 }, bilgi: { donem: "2026-11-04T14", kaynak: "ag" } });
    expect(ag.istekler).toHaveLength(2);
  });

  it("günlük istek gün boyunca tek kez yapılır", async () => {
    let an = new Date("2026-11-04T03:00:00Z");
    const ag = sahteAg([json({ n: 1 })]);
    const ist = istemciOlustur({ depo: new BellekDepo(), fetch: ag.f, simdi: () => an });
    await ist.getir(URL_, P, { gunluk: true });
    an = new Date("2026-11-04T20:00:00Z");
    expect((await ist.getir(URL_, P, { gunluk: true })).bilgi).toEqual({ donem: "2026-11-04", kaynak: "onbellek" });
    expect(ag.istekler).toHaveLength(1);
  });

  it("aynı anda gelen aynı istekler tek ağ isteğini paylaşır", async () => {
    const ag = sahteAg([json({ n: 1 })]);
    const ist = istemciOlustur({ depo: new BellekDepo(), fetch: ag.f, simdi: () => new Date("2026-11-04T10:15:00Z") });
    const [a, b, c] = await Promise.all([ist.getir(URL_, P), ist.getir(URL_, P), ist.getir(URL_, { ...P })]);
    expect(ag.istekler).toHaveLength(1);
    expect([a.veri, b.veri, c.veri]).toEqual([{ n: 1 }, { n: 1 }, { n: 1 }]);
  });

  it("istek sınırı (429): önceki dönemin verisine düşer ve bunu bildirir", async () => {
    let an = new Date("2026-11-04T10:15:00Z");
    const ag = sahteAg([json({ n: 1 }), json({ error: true, reason: "Hourly API request limit exceeded." }, 429)]);
    const ist = istemciOlustur({ depo: new BellekDepo(), fetch: ag.f, simdi: () => an });
    await ist.getir(URL_, P);
    an = new Date("2026-11-04T12:30:00Z");
    expect(await ist.getir(URL_, P)).toEqual({ veri: { n: 1 }, bilgi: { donem: "2026-11-04T13", kaynak: "eski" } });
  });

  it("bağlantı hatası: eski kayıt yoksa türü ve nedeni belli bir hata", async () => {
    const ist = istemciOlustur({ depo: new BellekDepo(), fetch: sahteAg([new TypeError("Failed to fetch")]).f });
    await expect(ist.getir(URL_, P)).rejects.toMatchObject({ name: "VeriHatasi", tur: "ag", neden: "Failed to fetch" });
  });

  it("429 ve eski kayıt yok: sınır hatası, API'nin açıklamasıyla", async () => {
    const ist = istemciOlustur({ depo: new BellekDepo(), fetch: sahteAg([json({ reason: "Daily limit" }, 429)]).f });
    await expect(ist.getir(URL_, P)).rejects.toMatchObject({ tur: "sinir", neden: "Daily limit", durum: 429 });
  });

  it("sunucu hatası (400): API'nin nedeni aktarılır", async () => {
    const ist = istemciOlustur({ depo: new BellekDepo(), fetch: sahteAg([json({ error: true, reason: "Cannot initialize" }, 400)]).f });
    await expect(ist.getir(URL_, P)).rejects.toMatchObject({ tur: "sunucu", neden: "Cannot initialize", durum: 400 });
  });

  it("boş yanıt önbelleğe yazılmaz", async () => {
    const depo = new BellekDepo();
    const ag = sahteAg([new Response("  ", { status: 200 }), json({ n: 2 })]);
    const ist = istemciOlustur({ depo, fetch: ag.f, simdi: () => new Date("2026-11-04T10:15:00Z") });
    expect((await ist.getir(URL_, P)).veri).toBeNull();
    expect(await depo.anahtarlar()).toEqual([]);
    expect((await ist.getir(URL_, P)).veri).toEqual({ n: 2 });
  });

  it("JSON olmayan yanıt önbelleğe yazılmaz ve biçim hatası verir", async () => {
    const depo = new BellekDepo();
    const ist = istemciOlustur({ depo, fetch: sahteAg([new Response("<html>502</html>", { status: 200 })]).f });
    await expect(ist.getir(URL_, P)).rejects.toMatchObject({ tur: "bicim" });
    expect(await depo.anahtarlar()).toEqual([]);
  });

  it("bir günden eski kayıtlar temizlenir", async () => {
    let an = new Date("2026-11-04T10:15:00Z");
    const depo = new BellekDepo();
    const ist = istemciOlustur({ depo, fetch: sahteAg([json({ n: 1 }), json({ n: 2 })]).f, simdi: () => an });
    await ist.getir(URL_, P);
    an = new Date("2026-11-05T10:20:00Z");
    await ist.getir(URL_, { ...P, latitude: 41 });
    const kalan = await depo.anahtarlar();
    expect(kalan).toHaveLength(1);
    expect(kalan[0]).toContain("latitude=41");
  });

  it("zaman aşımı ağ hatası sayılır", async () => {
    const yavas = ((_: unknown, secenek?: RequestInit) => new Promise<Response>((_coz, reddet) => {
      secenek?.signal?.addEventListener("abort", () => reddet(new DOMException("aborted", "AbortError")));
    })) as typeof fetch;
    const ist = istemciOlustur({ depo: new BellekDepo(), fetch: yavas, zamanAsimiMs: 20 });
    await expect(ist.getir(URL_, P)).rejects.toMatchObject({ tur: "ag" });
  });
});

describe("Open-Meteo işlevleri", () => {
  const saatler = Array.from({ length: 48 }, (_, i) => `2026-11-${14 + Math.floor(i / 24)}T${String(i % 24).padStart(2, "0")}:00`);
  const dolu = (adlar: string, n: number) => Object.fromEntries(adlar.split(",").map((a, j) => [a, Array.from({ length: n }, (_, i) => i + j)]));
  const tahminYaniti = {
    latitude: 39.9375, longitude: 32.875, elevation: 883, timezone: "Europe/Istanbul", utc_offset_seconds: 10800,
    current: { time: "2026-11-14T22:00", interval: 900, ...Object.fromEntries(om.ANLIK.split(",").map((a) => [a, 1])) },
    hourly: { time: saatler, ...dolu(om.SAATLIK, 48) },
    daily: { time: ["2026-11-14", "2026-11-15"], ...dolu(om.GUNLUK, 2),
             sunrise: ["2026-11-14T07:32", "2026-11-15T07:33"], sunset: ["2026-11-14T17:33", "2026-11-15T17:32"] },
  };

  it("tahmin: Streamlit sürümüyle aynı parametrelerle tek istek atar ve yanıtı tiplere çevirir", async () => {
    const ag = sahteAg([json(tahminYaniti)]);
    const ist = istemciOlustur({ depo: new BellekDepo(), fetch: ag.f, simdi: () => new Date("2026-11-14T19:30:00Z") });
    const t = await om.tahmin(ist, ANKARA);
    expect(ag.istekler).toHaveLength(1);
    const u = new URL(ag.istekler[0]!);
    expect(u.origin + u.pathname).toBe(om.FC);
    expect(Object.fromEntries(u.searchParams)).toEqual({
      latitude: "39.9199", longitude: "32.8543", current: om.ANLIK, hourly: om.SAATLIK, daily: om.GUNLUK,
      forecast_days: "10", timezone: "Europe/Istanbul",
    });
    expect(t.saatlik.zaman).toHaveLength(48);
    expect(Object.keys(t.saatlik.sutun)).toEqual(om.SAATLIK.split(","));
    expect(t.gunluk.gunBatimi[0]).toBe("2026-11-14T17:33");
    expect(t.gunluk.sutun.sunrise).toBeUndefined();
    expect(t).toMatchObject({ tz: "Europe/Istanbul", utcFarkiSn: 10800, rakim: 883, bilgi: { donem: "2026-11-14T22", kaynak: "ag" } });
  });

  it("tahmin: eksik değişkenli ya da hata bildiren yanıt arayüze ulaşmaz", async () => {
    const eksik = { ...tahminYaniti, hourly: { time: saatler, temperature_2m: saatler.map(() => 1) } };
    const ist = istemciOlustur({ depo: new BellekDepo(), fetch: sahteAg([json(eksik)]).f });
    await expect(om.tahmin(ist, ANKARA)).rejects.toMatchObject({ tur: "bicim" });
    const ist2 = istemciOlustur({ depo: new BellekDepo(), fetch: sahteAg([json({ error: true, reason: "x" })]).f });
    await expect(om.tahmin(ist2, ANKARA)).rejects.toMatchObject({ tur: "sunucu", neden: "x" });
  });

  it("ansambl: yalnızca istenen değişkenin üyeleri, şu andan başlayarak", async () => {
    const n = saatler.length, sutun = () => saatler.map((_, i) => i);
    const yanit = { timezone: "Europe/Istanbul", hourly: { time: saatler, temperature_2m: sutun(),
                    temperature_2m_member01: sutun(), temperature_2m_member02: sutun(), baska_degisken: sutun() } };
    const ist = istemciOlustur({ depo: new BellekDepo(), fetch: sahteAg([json(yanit)]).f });
    const { tablo } = await om.ansambl(ist, ANKARA, "ecmwf_ifs025", "temperature_2m", 2, new Date("2026-11-14T19:30:00Z"));
    expect(Object.keys(tablo.sutun)).toEqual(["temperature_2m", "temperature_2m_member01", "temperature_2m_member02"]);
    expect(tablo.zaman[0]).toBe("2026-11-14T22:00");
    expect(tablo.zaman).toHaveLength(n - 22);
    expect(tablo.sutun.temperature_2m_member01![0]).toBe(22);
  });

  it('konum "auto" ise şu anki saat yanıttaki saat dilimine göre bulunur', async () => {
    const yanit = { timezone: "Asia/Tokyo", hourly: { time: saatler, temperature_2m: saatler.map((_, i) => i) } };
    const ist = istemciOlustur({ depo: new BellekDepo(), fetch: sahteAg([json(yanit)]).f });
    const { tablo } = await om.ansambl(ist, { ...ANKARA, tz: "auto" }, "gfs_seamless", "temperature_2m", 2, new Date("2026-11-14T19:30:00Z"));
    expect(tablo.zaman[0]).toBe("2026-11-15T04:00");
  });

  it("yerAra: en çok 6 sonuç ister, bozuk kayıtları atar", async () => {
    const ag = sahteAg([json({ results: [{ name: "Uzungöl", latitude: 40.62, longitude: 40.29 }, { name: "bozuk" }] })]);
    const s = await om.yerAra(istemciOlustur({ depo: new BellekDepo(), fetch: ag.f }), "Uzungöl");
    expect(s).toEqual([{ name: "Uzungöl", latitude: 40.62, longitude: 40.29 }]);
    expect(Object.fromEntries(new URL(ag.istekler[0]!).searchParams)).toEqual({ name: "Uzungöl", count: "6", language: "tr" });
    const bos = await om.yerAra(istemciOlustur({ depo: new BellekDepo(), fetch: sahteAg([json({ generationtime_ms: 1 })]).f }), "Qwxzy");
    expect(bos).toEqual([]);
  });

  it("modelKosusu: koşu zamanı ile geçerlilik sonu ayrı alanlardadır", async () => {
    const meta = { last_run_initialisation_time: 1794636000, last_run_availability_time: 1794661750,
                   data_end_time: 1795165200, update_interval_seconds: 21600, temporal_resolution_seconds: 10800 };
    const k = await om.modelKosusu(istemciOlustur({ depo: new BellekDepo(), fetch: sahteAg([json(meta)]).f }), "ecmwf_ifs025");
    expect(k.baslangic.toISOString()).toBe("2026-11-14T06:00:00.000Z");   // 06Z koşusu
    expect(k.yayin.getTime()).toBeGreaterThan(k.baslangic.getTime());
    expect(k.veriSonu.getTime()).toBeGreaterThan(k.yayin.getTime());
    expect(k).toMatchObject({ model: "ecmwf_ifs025", guncellemeSn: 21600, adimSn: 10800 });
  });
});

describe("çok noktalı anlık sıcaklık", () => {
  it("dizi yanıtından her noktanın değerlerini alır; eksik nokta null olur", () => {
    const yanit = [{ current: { temperature_2m: 11.6, weather_code: 61, is_day: 0 } }, { hourly: {} }, { current: { temperature_2m: null, weather_code: 3, is_day: 1 } }];
    expect(cokluAnlikAyikla(yanit, 3)).toEqual([{ sicaklik: 11.6, kod: 61, gece: true }, null, { sicaklik: null, kod: 3, gece: false }]);
  });
  it("tek nokta istenince gelen nesneyi de kabul eder; bozuk yanıtta hepsi null", () => {
    expect(cokluAnlikAyikla({ current: { temperature_2m: -3, weather_code: 71, is_day: 1 } }, 1)).toEqual([{ sicaklik: -3, kod: 71, gece: false }]);
    expect(cokluAnlikAyikla(null, 2)).toEqual([null, null]);
    expect(cokluAnlikAyikla([], 1)).toEqual([null]);
  });
});

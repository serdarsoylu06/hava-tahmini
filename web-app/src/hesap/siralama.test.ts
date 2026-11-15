import { describe, expect, it } from "vitest";
import { referans } from "../referans";
import { BellekDepo } from "../veri/depo";
import { istemciOlustur } from "../veri/istemci";
import type { Tablo } from "../veri/tipler";
import * as sir from "./siralama";

interface Ref {
  csv: string;
  gozlem: sir.Seri;
  tahmin: Tablo;
  sonuclar: { ufuk: number; gun_sayisi: number; bilgi: sir.SiraBilgisi; ornekler: number[][];
              tablo: { kod: string; model: string; MAE: number; RMSE: number; Bias: number; N: number; alt: number; ust: number; grup: number }[] }[];
  bos: { tablo_yok: boolean; bilgi: sir.SiraBilgisi };
  sabitler: Record<string, unknown>;
}
const r = referans<Ref>("siralama");
const yakin = (a: number, b: number, ad: string) => expect(Math.abs(a - b), ad).toBeLessThan(1e-9);

describe("Python ile eşdeğerlik: model sıralaması", () => {
  it("sabitler ve model listesi (sırasıyla) aynı", () => {
    expect({ IEM: sir.IEM, ONCEKI: sir.ONCEKI, MODELLER: sir.MODELLER, UFUKLAR: [...sir.UFUKLAR], EN_UZUN: sir.EN_UZUN, KAPSAM: sir.KAPSAM, TEKRAR: sir.TEKRAR })
      .toEqual(r.sabitler);
    expect(Object.keys(sir.MODELLER)).toEqual(Object.keys(r.sabitler.MODELLER as object));
  });

  it("gozlemAyikla: saate yuvarlama, 15 dk kuralı, eksik ve çift raporlar Python ile aynı", () => {
    const o = sir.gozlemAyikla(r.csv)!;
    expect(o.zaman).toEqual(r.gozlem.zaman);
    expect(o.deger).toEqual(r.gozlem.deger);
    expect(o.zaman.length).toBeGreaterThan(600);
  });

  it("gozlemAyikla: boş ya da sıcaklık sütunu olmayan yanıt", () => {
    expect(sir.gozlemAyikla("station,valid,tmpf\n")).toBeNull();
    expect(sir.gozlemAyikla("station,valid\nLTAC,2026-11-01 00:50\n")).toBeNull();
    expect(sir.gozlemAyikla("")).toBeNull();
  });

  for (const k of r.sonuclar) {
    it(`siralama: +${k.ufuk * 24} saat, son ${k.gun_sayisi} gün — numpy'nin çekilişleriyle bütün sütunlar aynı`, () => {
      const { tablo, bilgi } = sir.siralama(sir.ufuk(r.tahmin, k.ufuk), r.gozlem, k.gun_sayisi, k.ornekler);
      expect(bilgi).toEqual(k.bilgi);
      // İki modelin MAE'si matematiksel olarak eşit olabilir (ölçümler 0,1 °C'ye yuvarlı); o zaman aralarındaki sıra
      // toplama sırasının son basamağına kalır. Bu yüzden içerik model koduna göre, sıra ise ayrıca denetlenir.
      const kodla = <T extends { kod: string }>(x: readonly T[]) => [...x].sort((p, q) => p.kod.localeCompare(q.kod));
      const bulunan = kodla(tablo!), beklenen = kodla(k.tablo);
      expect(bulunan.map((s) => [s.kod, s.model, s.N, s.grup])).toEqual(beklenen.map((s) => [s.kod, s.model, s.N, s.grup]));
      bulunan.forEach((s, i) => {
        for (const ad of ["MAE", "RMSE", "Bias", "alt", "ust"] as const) yakin(s[ad], beklenen[i]![ad], `${s.kod} ${ad}`);
      });
      tablo!.forEach((s, i) => {
        if (i === 0) return;
        const once = tablo![i - 1]!;
        expect(s.grup >= once.grup && (s.grup > once.grup || s.MAE >= once.MAE), `sıra: ${once.kod} → ${s.kod}`).toBe(true);
        if (Math.abs(s.MAE - k.tablo[i]!.MAE) > 1e-9) throw new Error(`sıra Python'dan farklı: ${i}. satır ${s.kod}`);
      });
    });

    it(`siralama: +${k.ufuk * 24} saat, son ${k.gun_sayisi} gün — kendi çekilişleriyle hata ölçütleri aynı, aralık yakın`, () => {
      const { tablo, bilgi } = sir.siralama(sir.ufuk(r.tahmin, k.ufuk), r.gozlem, k.gun_sayisi);
      expect(bilgi).toEqual(k.bilgi);
      const beklenen = new Map(k.tablo.map((s) => [s.kod, s]));
      for (const s of tablo!) {
        const b = beklenen.get(s.kod)!;
        for (const ad of ["MAE", "RMSE", "Bias"] as const) yakin(s[ad], b[ad], `${s.kod} ${ad}`);
        expect(s.alt).toBeLessThan(s.MAE);
        expect(s.ust).toBeGreaterThan(s.MAE);
        // rastgele çekilişler farklı: güven aralığının uçları, aralığın genişliğinin dörtte birinden az oynamalı
        const genislik = b.ust - b.alt;
        expect(Math.abs(s.alt - b.alt), `${s.kod} alt`).toBeLessThan(genislik / 4);
        expect(Math.abs(s.ust - b.ust), `${s.kod} ust`).toBeLessThan(genislik / 4);
      }
      expect(tablo![0]!.grup).toBe(1);
      const ikinci = sir.siralama(sir.ufuk(r.tahmin, k.ufuk), r.gozlem, k.gun_sayisi);
      expect(ikinci.tablo).toEqual(tablo);                                      // sabit tohum: her seferinde aynı
    });
  }

  it("ölçümle örtüşmeyen tahmin: sıralama yok, bütün modeller dışarıda", () => {
    const kaymis: Tablo = { zaman: r.tahmin.zaman.map((z) => `${Number(z.slice(0, 4)) + 2}${z.slice(4)}`), sutun: sir.ufuk(r.tahmin, 1).sutun };
    const { tablo, bilgi } = sir.siralama(kaymis, r.gozlem, 30);
    expect(tablo === null).toBe(r.bos.tablo_yok);
    expect(bilgi).toEqual(r.bos.bilgi);
    expect(sir.siralama(sir.ufuk(r.tahmin, 1), { zaman: [], deger: [] }, 30).tablo).toBeNull();
  });
});

describe("sıralama verisinin indirilmesi", () => {
  const an = new Date("2026-11-14T10:00:00Z");

  it("gunler: bugün hariç, UTC günleri", () => {
    expect(sir.gunler(90, an)).toEqual({ bas: "2026-08-16", son: "2026-11-14" });
    expect(sir.gunler(1, new Date("2026-01-01T00:00:00Z"))).toEqual({ bas: "2025-12-31", son: "2026-01-01" });
  });

  it("gozlemler: IEM'e Streamlit sürümüyle aynı parametreler, günde bir istek", async () => {
    const istekler: string[] = [];
    const ist = istemciOlustur({ depo: new BellekDepo(), simdi: () => an,
      fetch: (async (u: RequestInfo | URL) => { istekler.push(String(u)); return new Response("station,valid,tmpf\nLTAC,2026-11-13 23:50,41.00\n"); }) as typeof fetch });
    const o = await sir.gozlemler(ist, "LTAC", an);
    expect(o).toEqual({ zaman: ["2026-11-14T00:00"], deger: [5] });
    expect(Object.fromEntries(new URL(istekler[0]!).searchParams)).toEqual({
      station: "LTAC", data: "tmpf", tz: "Etc/UTC", format: "onlycomma", missing: "M", report_type: "3",
      year1: "2026", month1: "8", day1: "16", year2: "2026", month2: "11", day2: "14" });
    await sir.gozlemler(ist, "LTAC", an);
    expect(istekler).toHaveLength(1);
  });

  it("tahminler: istasyonun koordinatı ve rakımıyla, 8 model × 3 ufuk", async () => {
    const istekler: string[] = [];
    const yanit = { hourly: { time: ["2026-11-13T00:00"], temperature_2m_previous_day1_ecmwf_ifs025: [4.2] } };
    const ist = istemciOlustur({ depo: new BellekDepo(), simdi: () => an,
      fetch: (async (u: RequestInfo | URL) => { istekler.push(String(u)); return new Response(JSON.stringify(yanit)); }) as typeof fetch });
    const t = await sir.tahminler(ist, { lat: 40.128, lon: 32.995, rakim: 953 }, an);
    expect(sir.ufuk(t!, 1)).toEqual({ zaman: ["2026-11-13T00:00"], sutun: { ecmwf_ifs025: [4.2] } });
    expect(Object.fromEntries(new URL(istekler[0]!).searchParams)).toEqual({
      latitude: "40.128", longitude: "32.995", timezone: "GMT", elevation: "953",
      hourly: "temperature_2m_previous_day1,temperature_2m_previous_day2,temperature_2m_previous_day3",
      models: "ecmwf_ifs025,icon_seamless,gfs_seamless,meteofrance_seamless,ukmo_seamless,jma_seamless,gem_seamless,cma_grapes_global",
      start_date: "2026-08-16", end_date: "2026-11-13" });
    await sir.tahminler(ist, { lat: 40.128, lon: 32.995 }, an);
    expect(new URL(istekler[1]!).searchParams.has("elevation")).toBe(false);
  });

  it("ağ hatasında null döner", async () => {
    const ist = istemciOlustur({ depo: new BellekDepo(), fetch: (async () => { throw new TypeError("Failed to fetch"); }) as typeof fetch });
    expect(await sir.gozlemler(ist, "LTAC", an)).toBeNull();
    expect(await sir.tahminler(ist, { lat: 40, lon: 33 }, an)).toBeNull();
  });
});

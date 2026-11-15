import { describe, expect, it } from "vitest";
import { referans, yerlesimDosyasi } from "../referans";
import type { AramaSonucu, Konum } from "../veri/tipler";
import { konumCoz, VARSAYILAN_YER, YerBulunamadi, yerOku, yerYaz } from "./url";
import { aramaEtiketi, aramaKonumu, konumKaydi, noktaKonumu, oner, type YerlesimDosyasi, yerlesimleriKur } from "./yerler";

const yerlesimler = yerlesimleriKur(yerlesimDosyasi<YerlesimDosyasi>());
const aramaYok = async () => { throw new Error("yer listesindeki bir ad için ağa çıkılmamalı"); };

describe("Python ile eşdeğerlik: yer listesi", () => {
  it("liste Python'daki kadar kayıt içerir ve konumKaydi 120+ etikette aynı", () => {
    const r = referans<{ toplam: number; kayitlar: { etiket: string; konum: Konum }[] }>("konum_kaydi");
    expect(yerlesimler.size).toBe(r.toplam);
    expect(r.kayitlar.length).toBeGreaterThanOrEqual(120);
    for (const { etiket, konum } of r.kayitlar) expect(konumKaydi(yerlesimler.get(etiket)!), etiket).toEqual(konum);
  });

  it("noktaKonumu, 112 noktada Python ile aynı ad, saat dilimi ve bölgeyi verir", () => {
    const r = referans<{ lat: number; lon: number; konum: Konum }[]>("nokta_konumu");
    expect(r.length).toBe(112);
    for (const { lat, lon, konum } of r) expect(noktaKonumu(yerlesimler, lat, lon), `${lat}, ${lon}`).toEqual(konum);
  });

  it("verilen ad ve bölge korunur (kayıtlı nokta)", () => {
    const k = noktaKonumu(yerlesimler, 41.02, 38.8, "Tirebolu açığı – lüfer", "Kayıtlı nokta");
    expect(k).toMatchObject({ ad: "Tirebolu açığı – lüfer", bolge: "Kayıtlı nokta", tz: "Europe/Istanbul", rakim: null });
  });
});

describe("arama önerileri", () => {
  it("büyük-küçük harf ve Türkçe karakter ayırmaz", () => {
    expect(oner(yerlesimler, "istanbul")[0]?.etiket).toBe("İstanbul");
    expect(oner(yerlesimler, "ISPARTA")[0]?.ad).toBe("Isparta");
    expect(oner(yerlesimler, "tireb")[0]?.etiket).toBe("Tirebolu, Giresun");
  });

  it("boş sorguda öneri yok, en çok istenen sayıda sonuç", () => {
    expect(oner(yerlesimler, "  ")).toEqual([]);
    expect(oner(yerlesimler, "a", 5)).toHaveLength(5);
  });
});

describe("?yer= adres parametresi", () => {
  it("okuma: yoksa ya da boşsa null; Türkçe karakter ve virgül çözülür", () => {
    expect(yerOku("")).toBeNull();
    expect(yerOku("?yer=")).toBeNull();
    expect(yerOku("?yer=Ankara")).toBe("Ankara");
    expect(yerOku("?yer=Tirebolu%2C+Giresun")).toBe("Tirebolu, Giresun");
    expect(yerOku("?mod=uzman&yer=%C4%B0stanbul")).toBe("İstanbul");
  });

  it("yazma: diğer parametreleri korur, okununca aynı değer çıkar", () => {
    const s = yerYaz("?mod=uzman&yer=Ankara", "Londra (London), Birleşik Krallık");
    expect(new URLSearchParams(s).get("mod")).toBe("uzman");
    expect(yerOku(s)).toBe("Londra (London), Birleşik Krallık");
  });

  it("parametre yoksa Ankara açılır ve ağa çıkılmaz", async () => {
    const c = await konumCoz(null, yerlesimler, aramaYok);
    expect(VARSAYILAN_YER).toBe("Ankara");
    expect(c).toMatchObject({ etiket: "Ankara", kaynak: "liste", konum: { ad: "Ankara", tz: "Europe/Istanbul", bolge: "Türkiye" } });
  });

  it("listedeki etiket: Streamlit testlerindeki üç konum", async () => {
    for (const etiket of ["Ankara", "Tirebolu, Giresun", "Londra (London), Birleşik Krallık"]) {
      const c = await konumCoz(etiket, yerlesimler, aramaYok);
      expect(c.konum).toEqual(konumKaydi(yerlesimler.get(etiket)!));
    }
  });

  it("listede olmayan ad yer adı servisinde aranır; ilk sonuç seçilir, hepsi seçenek olarak döner", async () => {
    const sonuclar: AramaSonucu[] = [
      { name: "Uzungöl", latitude: 40.62, longitude: 40.29, elevation: 1090, timezone: "Europe/Istanbul", admin1: "Trabzon", country: "Türkiye" },
      { name: "Uzungöl", latitude: 39.1, longitude: 35.2, country: "Türkiye" },
    ];
    const aranan: string[] = [];
    const c = await konumCoz("Uzungöl", yerlesimler, async (ad) => { aranan.push(ad); return sonuclar; });
    expect(aranan).toEqual(["Uzungöl"]);
    expect(c.kaynak).toBe("arama");
    expect(c.konum).toEqual({ ad: "Uzungöl", lat: 40.62, lon: 40.29, tz: "Europe/Istanbul", rakim: 1090, bolge: "Trabzon, Türkiye" });
    expect(c.secenekler).toHaveLength(2);
    expect(aramaKonumu(sonuclar[1]!)).toMatchObject({ tz: "auto", rakim: null, bolge: "Türkiye" });
    expect(aramaEtiketi(sonuclar[0]!)).toBe("Uzungöl, Trabzon, Türkiye");
  });

  it("hiç sonuç yoksa anlaşılır hata", async () => {
    await expect(konumCoz("Qwxzy", yerlesimler, async () => [])).rejects.toBeInstanceOf(YerBulunamadi);
  });
});

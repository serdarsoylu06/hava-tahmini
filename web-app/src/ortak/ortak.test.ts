import { describe, expect, it } from "vitest";
import { referans } from "../referans";
import { kerteriz, mesafeKm, YON8, yonAdi } from "./cografya";
import { durum, simge } from "./hava";
import { pyBicim } from "./sayi";
import { koyuMu, SIRADAKI, temaCoz, type TemaSecimi } from "../kabuk/tema";
import { sonSecimCoz } from "./url";
import { GUNLER, gunYaz, haftaGunu, saatBasi, yerelSaat, zamanYaz } from "./zaman";

describe("Python ile eşdeğerlik: coğrafya", () => {
  it("yonAdi, -180°…720° arası her çeyrek derecede Python ile aynı", () => {
    const r = referans<{ derece: number; ad: string }[]>("yon_adi");
    expect(r.length).toBeGreaterThan(3000);
    for (const { derece, ad } of r) expect(yonAdi(derece), `${derece}°`).toBe(ad);
  });

  it("mesafeKm ve kerteriz, 206 nokta çiftinde Python ile aynı (10⁻⁹ bağıl hata)", () => {
    const r = referans<{ girdi: [number, number, number, number]; km: number; kerteriz: number }[]>("mesafe_kerteriz");
    for (const { girdi, km, kerteriz: k } of r) {
      expect(Math.abs(mesafeKm(...girdi) - km), `mesafe ${girdi}`).toBeLessThanOrEqual(1e-9 * Math.max(1, km));
      const fark = Math.abs(kerteriz(...girdi) - k);
      expect(Math.min(fark, 360 - fark), `kerteriz ${girdi}`).toBeLessThanOrEqual(1e-7);
    }
  });

  it("pusula ve gün adları Python sabitleriyle aynı", () => {
    const s = referans<{ YONLER: string[]; GUNLER: string[] }>("sabitler");
    expect([...YON8]).toEqual(s.YONLER);
    expect([...GUNLER]).toEqual(s.GUNLER);
  });
});

describe("Python ile eşdeğerlik: sayı biçimi", () => {
  it('pyBicim, f"{x:.nf}" ile aynı (tam ortadaki değerler dahil)', () => {
    const r = referans<{ x: number; b0: string; b1: string; b2: string; b3: string }[]>("sayi_bicimi");
    for (const { x, b0, b1, b2, b3 } of r) {
      expect([pyBicim(x, 0), pyBicim(x, 1), pyBicim(x, 2), pyBicim(x, 3)], String(x)).toEqual([b0, b1, b2, b3]);
    }
  });

  it("toFixed'den ayrıldığı yerler: çifte yuvarlama", () => {
    expect(pyBicim(2.5)).toBe("2");
    expect(pyBicim(3.5)).toBe("4");
    expect(pyBicim(-2.5)).toBe("-2");
    expect(pyBicim(41.125, 2)).toBe("41.12");
  });
});

describe("Python ile eşdeğerlik: zaman yazımı", () => {
  it("zamanYaz ve gunYaz, yıl sonunu da kapsayan 40 zamanda Python ile aynı", () => {
    const r = referans<{ t: string; zaman: string; gun: string }[]>("zaman_yazimi");
    for (const { t, zaman, gun } of r) {
      expect(zamanYaz(t)).toBe(zaman);
      expect(gunYaz(t)).toBe(gun);
    }
  });

  it("haftaGunu: Pazartesi 0, Pazar 6", () => {
    expect(haftaGunu("2026-11-16T00:00")).toBe(0);
    expect(haftaGunu("2026-11-15T23:00")).toBe(6);
    expect(haftaGunu("2028-02-29T12:00")).toBe(1);
  });

  it("yerelSaat: saat dilimi ve yaz saati geçişleri", () => {
    expect(yerelSaat(new Date("2026-11-14T19:05:00Z"), "Europe/Istanbul")).toBe("2026-11-14T22:05");
    expect(yerelSaat(new Date("2026-12-31T21:30:00Z"), "Europe/Istanbul")).toBe("2027-01-01T00:30");
    expect(yerelSaat(new Date("2026-07-01T12:00:00Z"), "Europe/London")).toBe("2026-07-01T13:00");
    expect(yerelSaat(new Date("2026-01-01T12:00:00Z"), "Europe/London")).toBe("2026-01-01T12:00");
    expect(yerelSaat(new Date("2026-11-14T19:05:00Z"), "Asia/Kolkata")).toBe("2026-11-15T00:35");
    expect(saatBasi(new Date("2026-11-14T19:05:00Z"), "Asia/Kolkata")).toBe("2026-11-15T00:00");
    // gece yarısı "24:00" değil "00:00" yazılmalı
    expect(yerelSaat(new Date("2026-11-14T21:00:00Z"), "Europe/Istanbul")).toBe("2026-11-15T00:00");
  });
});

describe("Python ile eşdeğerlik: WMO hava kodları", () => {
  it("simge ve durum, tablodaki ve tabloda olmayan kodlarda Python ile aynı", () => {
    const r = referans<{ kod: number; gunduz: string; gece: string; durum: string }[]>("wmo");
    expect(r.length).toBe(31);
    for (const k of r) {
      expect([simge(k.kod, true), simge(k.kod, false), durum(k.kod)], String(k.kod)).toEqual([k.gunduz, k.gece, k.durum]);
    }
  });

  it("eksik kod: bilinmiyor", () => {
    expect(durum(null)).toBe("Bilinmiyor");
    expect(simge(undefined)).toBe("❔");
    expect(durum(Number.NaN)).toBe("Bilinmiyor");
  });
});

describe("son bakılan yer", () => {
  it("saklanan yer ve nokta seçimlerini çözer", () => {
    expect(sonSecimCoz('{"tur":"yer","etiket":" Giresun "}')).toEqual({ tur: "yer", etiket: "Giresun" });
    expect(sonSecimCoz('{"tur":"nokta","lat":40.9,"lon":38.4,"bolge":"Kayıtlı nokta"}')).toEqual({ tur: "nokta", lat: 40.9, lon: 38.4, bolge: "Kayıtlı nokta" });
    expect(sonSecimCoz('{"tur":"nokta","lat":40.9,"lon":38.4}')).toEqual({ tur: "nokta", lat: 40.9, lon: 38.4 });
  });
  it("bozuk, eksik ya da geçersiz kayıtta null döner", () => {
    for (const m of [null, undefined, "", "bozuk", "null", "[]", '{"tur":"yer"}', '{"tur":"yer","etiket":"  "}', '{"tur":"nokta","lat":"40","lon":38}',
                     '{"tur":"nokta","lat":95,"lon":38}', '{"tur":"baska","etiket":"x"}']) expect(sonSecimCoz(m), String(m)).toBeNull();
  });
});

describe("tema seçimi", () => {
  it("saklanan değeri çözer; tanınmayan her şey cihaza uyar", () => {
    expect(temaCoz("acik")).toBe("acik");
    expect(temaCoz("koyu")).toBe("koyu");
    for (const m of [null, undefined, "", "oto", "dark", "ACIK"]) expect(temaCoz(m)).toBe("oto");
  });
  it("elle seçim cihazın ayarını ezer; oto cihazı izler", () => {
    expect(koyuMu("koyu", true)).toBe(true);
    expect(koyuMu("acik", false)).toBe(false);
    expect(koyuMu("oto", true)).toBe(false);
    expect(koyuMu("oto", false)).toBe(true);
  });
  it("düğme üç seçenek arasında döner", () => {
    let s: TemaSecimi = "oto";
    const gorulen: TemaSecimi[] = [s];
    for (let i = 0; i < 3; i++) { s = SIRADAKI[s]; gorulen.push(s); }
    expect(gorulen).toEqual(["oto", "acik", "koyu", "oto"]);
  });
});

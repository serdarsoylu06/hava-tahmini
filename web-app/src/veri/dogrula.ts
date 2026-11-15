/** API yanıtlarının doğrulanması. Beklenen biçimde olmayan yanıt arayüze ulaşmadan burada durdurulur;
 * eksik ölçümler (null) ise hata değildir ve null olarak korunur. */
import { VeriHatasi } from "./istemci";
import type { Anlik, Deger, GunlukTablo, Tablo } from "./tipler";

const SAAT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const GUN = /^\d{4}-\d{2}-\d{2}$/;
const SAYI = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

const bicimHatasi = (neden: string) => new VeriHatasi("bicim", "Yanıt beklenen biçimde değil", neden);

export function nesneMi(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/** pandas'taki `pd.to_numeric(errors="coerce")` karşılığı: sayıya çevrilemeyen her şey eksik veri (null) olur. */
export function sayiyaCevir(x: unknown): Deger {
  if (typeof x === "number") return Number.isFinite(x) ? x : null;
  if (typeof x === "boolean") return x ? 1 : 0;
  if (typeof x === "string") {
    const s = x.trim();
    return SAYI.test(s) ? Number(s) : null;
  }
  return null;
}

/** Open-Meteo hata yanıtı: {"error": true, "reason": "…"} */
export function apiHatasiMi(js: unknown): void {
  if (nesneMi(js) && js.error === true) throw new VeriHatasi("sunucu", "Veri alınamadı", String(js.reason ?? ""));
}

function zamanDizisi(ham: Record<string, unknown>, desen: RegExp, ad: string): string[] {
  const t = ham.time;
  if (!Array.isArray(t) || !t.every((x): x is string => typeof x === "string" && desen.test(x))) {
    throw bicimHatasi(`${ad}: "time" dizisi yok ya da biçimi bozuk`);
  }
  return t;
}

function sutunlar(ham: Record<string, unknown>, n: number, beklenen: readonly string[] | undefined, ad: string,
                  atla: readonly string[] = []): Record<string, Deger[]> {
  const eksik = (beklenen ?? []).filter((b) => !(b in ham));
  if (eksik.length) throw bicimHatasi(`${ad}: eksik değişken: ${eksik.join(", ")}`);
  const sonuc: Record<string, Deger[]> = {};
  for (const [k, v] of Object.entries(ham)) {
    if (k === "time" || atla.includes(k)) continue;
    if (!Array.isArray(v) || v.length !== n) throw bicimHatasi(`${ad}: "${k}" uzunluğu zaman dizisiyle uyuşmuyor`);
    sonuc[k] = v.map(sayiyaCevir);
  }
  return sonuc;
}

/** Saatlik blok → Tablo (hava/veri.py → tablo). `beklenen` verilirse o değişkenlerin hepsi yanıtta olmalıdır. */
export function tabloDogrula(ham: unknown, beklenen?: readonly string[]): Tablo {
  if (!nesneMi(ham)) throw bicimHatasi("saatlik blok yok");
  const zaman = zamanDizisi(ham, SAAT, "saatlik");
  return { zaman, sutun: sutunlar(ham, zaman.length, beklenen, "saatlik") };
}

const saatMetni = (ad: string) => (x: unknown): string | null => {
  if (x == null) return null;
  if (typeof x === "string" && SAAT.test(x)) return x;
  throw bicimHatasi(`günlük: "${ad}" biçimi bozuk`);
};

export function gunlukDogrula(ham: unknown, beklenen?: readonly string[]): GunlukTablo {
  if (!nesneMi(ham)) throw bicimHatasi("günlük blok yok");
  const gun = zamanDizisi(ham, GUN, "günlük");
  const saatDizisi = (ad: string) => {
    const v = ham[ad];
    if (v === undefined) return gun.map(() => null);
    if (!Array.isArray(v) || v.length !== gun.length) throw bicimHatasi(`günlük: "${ad}" uzunluğu uyuşmuyor`);
    return v.map(saatMetni(ad));
  };
  return { gun, sutun: sutunlar(ham, gun.length, beklenen?.filter((b) => b !== "sunrise" && b !== "sunset"), "günlük",
                                ["sunrise", "sunset"]),
           gunDogumu: saatDizisi("sunrise"), gunBatimi: saatDizisi("sunset") };
}

export function anlikDogrula(ham: unknown, beklenen?: readonly string[]): Anlik {
  if (!nesneMi(ham) || typeof ham.time !== "string" || !SAAT.test(ham.time)) throw bicimHatasi("anlık blok yok");
  const eksik = (beklenen ?? []).filter((b) => !(b in ham));
  if (eksik.length) throw bicimHatasi(`anlık: eksik değişken: ${eksik.join(", ")}`);
  const deger: Record<string, Deger> = {};
  for (const [k, v] of Object.entries(ham)) if (k !== "time" && k !== "interval") deger[k] = sayiyaCevir(v);
  return { zaman: ham.time, deger };
}

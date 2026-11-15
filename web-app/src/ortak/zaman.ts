/** Zaman yardımcıları.
 *
 * Open-Meteo saatleri konumun yerel duvar saatiyle, saat dilimi eki olmadan verir ("2026-11-14T22:00").
 * Bu metinler Date'e çevrilmez: tarayıcının kendi saat dilimi araya girmesin diye metin olarak taşınır ve
 * karşılaştırılır (aynı biçimdeki ISO metinleri sözlük sırasıyla doğru sıralanır). */

/** hava/yorum.py → GUNLER (Pazartesi = 0) */
export const GUNLER = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"] as const;

const bicimciler = new Map<string, Intl.DateTimeFormat>();

function bicimci(tz: string): Intl.DateTimeFormat {
  let b = bicimciler.get(tz);
  if (!b) {
    b = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
                                           hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    bicimciler.set(tz, b);
  }
  return b;
}

/** Verilen anın `tz` saat dilimindeki duvar saati: "YYYY-AA-GGTSS:DD". */
export function yerelSaat(an: Date, tz: string): string {
  const p: Record<string, string> = {};
  for (const x of bicimci(tz).formatToParts(an)) p[x.type] = x.value;
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** İçinde bulunulan saatin başı (yerel): "YYYY-AA-GGTSS:00". pandas'taki `.floor("h")` karşılığı. */
export function saatBasi(an: Date, tz: string): string {
  return `${yerelSaat(an, tz).slice(0, 13)}:00`;
}

/** Yerel zaman metninin haftanın günü (Pazartesi = 0), Python'daki `weekday()` gibi. */
export function haftaGunu(t: string): number {
  const gun = new Date(Date.UTC(Number(t.slice(0, 4)), Number(t.slice(5, 7)) - 1, Number(t.slice(8, 10)))).getUTCDay();
  return (gun + 6) % 7;
}

/** "Cmt 14.11 22:00" — hava/yorum.py → zaman */
export function zamanYaz(t: string): string {
  return `${GUNLER[haftaGunu(t)]} ${t.slice(8, 10)}.${t.slice(5, 7)} ${t.slice(11, 16)}`;
}

/** "Cmt 14.11" — hava/yorum.py → gun */
export function gunYaz(t: string): string {
  return `${GUNLER[haftaGunu(t)]} ${t.slice(8, 10)}.${t.slice(5, 7)}`;
}

const iki = (n: number) => String(n).padStart(2, "0");

/** Yerel zaman metnini, saat dilimsiz bir sayaç olarak milisaniyeye çevirir (yalnızca fark almak ve saat eklemek
 * için; gerçek bir an değildir). Saniyeli ("…T07:32:10") ve yalnız tarihli ("2026-11-14") metinleri de kabul eder. */
export function sayac(t: string): number {
  return Date.UTC(Number(t.slice(0, 4)), Number(t.slice(5, 7)) - 1, Number(t.slice(8, 10)),
                  Number(t.slice(11, 13) || 0), Number(t.slice(14, 16) || 0), Number(t.slice(17, 19) || 0));
}

/** Sayaçtan yerel zaman metnine: "YYYY-AA-GGTSS:DD". */
export function sayactan(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${iki(d.getUTCMonth() + 1)}-${iki(d.getUTCDate())}T${iki(d.getUTCHours())}:${iki(d.getUTCMinutes())}`;
}

/** Duvar saatine saat ekler (pandas'taki `t + pd.Timedelta(hours=n)` gibi; yaz saati geçişi gözetilmez). */
export function saatEkle(t: string, saat: number): string {
  return sayactan(sayac(t) + saat * 3_600_000);
}

/** İki yerel zaman arasındaki fark (saat): a − b. */
export function saatFarki(a: string, b: string): number {
  return (sayac(a) - sayac(b)) / 3_600_000;
}

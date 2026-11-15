/** Açık / koyu tema. Varsayılan "oto": cihazın ayarı izlenir. Kullanıcı açık ya da koyuyu elle seçerse seçim bu
 * tarayıcıda saklanır ve <html data-tema="…"> ile uygulanır (renkler stil.css'te). Sayfa ilk çizilmeden önce
 * index.html'deki küçük betik aynı değeri uygular; böylece açılışta yanlış tema bir an bile görünmez. */
import { useSyncExternalStore } from "react";

export type TemaSecimi = "oto" | "acik" | "koyu";
export const TEMA_ANAHTARI = "havalab_tema";
/** Düğmeye her basışta geçilen sıra. */
export const SIRADAKI: Readonly<Record<TemaSecimi, TemaSecimi>> = { oto: "acik", acik: "koyu", koyu: "oto" };
export const TEMA_ADI: Readonly<Record<TemaSecimi, string>> = { oto: "cihaza uy", acik: "açık", koyu: "koyu" };
/** Tarayıcının üst çubuğunun rengi (stil.css'teki --zemin ile aynı). */
const ZEMIN = { koyu: "#1C2829", acik: "#E8EEE2" } as const;

/** Saklanmış değeri çözer; tanınmayan her şey "oto"dur. */
export function temaCoz(metin: string | null | undefined): TemaSecimi {
  return metin === "acik" || metin === "koyu" ? metin : "oto";
}

/** Seçime ve cihazın ayarına göre koyu tema mı gösterilecek? */
export function koyuMu(secim: TemaSecimi, cihazAcikTemada: boolean): boolean {
  return secim === "koyu" || (secim === "oto" && !cihazAcikTemada);
}

const oku = (): TemaSecimi => { try { return temaCoz(localStorage.getItem(TEMA_ANAHTARI)); } catch { return "oto"; } };
const cihaz = () => (typeof matchMedia === "undefined" ? null : matchMedia("(prefers-color-scheme: light)"));

let secim: TemaSecimi = typeof localStorage === "undefined" ? "oto" : oku();
const dinleyenler = new Set<() => void>();

function uygula(): void {
  if (typeof document === "undefined") return;
  if (secim === "oto") delete document.documentElement.dataset.tema; else document.documentElement.dataset.tema = secim;
  // üst çubuk rengi: "oto"da iki etiket kendi ortam sorgusuyla çalışır; elle seçimde ikisi de seçilen temanın rengini alır
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
    const kendi = m.media.includes("light") ? ZEMIN.acik : ZEMIN.koyu;
    m.content = secim === "oto" ? kendi : ZEMIN[secim];
  });
}

/** Temayı değiştirir, saklar ve dinleyen bileşenleri haberdar eder. */
export function temaSec(yeni: TemaSecimi): void {
  secim = yeni;
  try { if (yeni === "oto") localStorage.removeItem(TEMA_ANAHTARI); else localStorage.setItem(TEMA_ANAHTARI, yeni); } catch { /* depo kapalı: seçim bu oturumda kalır */ }
  uygula();
  dinleyenler.forEach((d) => d());
}

function abone(d: () => void): () => void {
  dinleyenler.add(d);
  const ortam = cihaz();
  ortam?.addEventListener("change", d);
  return () => { dinleyenler.delete(d); ortam?.removeEventListener("change", d); };
}

uygula();

/** Geçerli tema seçimi ve sonucu; seçim ya da cihazın ayarı değişince bileşen yeniden çizilir. */
export function useTema(): { secim: TemaSecimi; koyu: boolean } {
  const s = useSyncExternalStore(abone, () => secim, () => "oto" as TemaSecimi);
  const cihazAcik = useSyncExternalStore(abone, () => cihaz()?.matches ?? false, () => false);
  return { secim: s, koyu: koyuMu(s, cihazAcik) };
}

/** Koyu tema mı? (harita altlığı, ok ve çizgi renkleri için) */
export const useKoyuTema = (): boolean => useTema().koyu;

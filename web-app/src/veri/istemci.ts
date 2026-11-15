/** API istemcisi: dönem önbelleği, eski veriye düşme ve hata sınıflaması (hava/veri.py → indir, getir).
 *
 * İstek sayısını azaltmak için üç kat var:
 *  1. aynı dönemde aynı istek depodan okunur (ağa çıkılmaz),
 *  2. aynı anda birden çok bileşen aynı isteği yaparsa tek bir ağ isteği paylaşılır,
 *  3. istek başarısız olursa önceki dönemin kaydı gösterilir (kullanıcı boş sayfa görmez). */
import { type Depo, GUN_MS } from "./depo";
import { donem, gunDonemi } from "./donem";
import type { YanitBilgisi } from "./tipler";

export type Parametre = Record<string, string | number | boolean | readonly (string | number)[]>;

/** sinir: istek sınırı aşıldı (429) · ag: bağlantı kurulamadı ya da zaman aşımı · sunucu: API hata döndürdü ·
 * bicim: yanıt beklenen biçimde değil */
export type HataTuru = "sinir" | "ag" | "sunucu" | "bicim";

export class VeriHatasi extends Error {
  constructor(readonly tur: HataTuru, mesaj: string, readonly neden = "", readonly durum?: number) {
    super(mesaj);
    this.name = "VeriHatasi";
  }
}

export interface Yanit<T = unknown> {
  /** Sunucu boş gövde döndürdüyse null (ör. 204); boş yanıt önbelleğe yazılmaz. */
  veri: T | null;
  bilgi: YanitBilgisi;
}

export interface GetirSecenek {
  /** Yalnızca geçmişe bakan, gün içinde değişmeyen istekler günde bir yenilenir. */
  gunluk?: boolean;
  /** Özel dönem etiketi (ör. aylık arşiv için "2026-11"): verilirse saatlik/günlük dönemin yerini alır. */
  donem?: string;
  /** Kaydın saklanacağı gün sayısı (varsayılan 1). Aylık arşiv gibi pahalı istekler için büyütülür. */
  omurGun?: number;
  /** Bu istek için zaman aşımı (ms); verilmezse istemcinin varsayılanı. */
  zamanAsimiMs?: number;
  /** Yanıt JSON değil düz metinse (ör. CSV) true: `veri` metnin kendisi olur. */
  metin?: boolean;
}

export interface IstemciAyar {
  depo: Depo;
  /** Varsayılan: tarayıcının fetch'i. Testlerde sahte bir işlev verilir. */
  fetch?: typeof fetch;
  simdi?: () => Date;
  /** Varsayılan 90 sn (Streamlit sürümüyle aynı; arşiv istekleri uzun sürebilir). */
  zamanAsimiMs?: number;
}

export interface Istemci {
  getir<T = unknown>(url: string, params: Parametre, secenek?: GetirSecenek): Promise<Yanit<T>>;
}

const metin = (v: Parametre[string]) => (Array.isArray(v) ? v.join(",") : String(v));

/** İsteğin tam adresi. Parametre sırası verildiği gibidir. */
export function adres(url: string, params: Parametre): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) p.set(k, metin(v));
  const sorgu = p.toString();
  return sorgu ? `${url}?${sorgu}` : url;
}

/** Önbellek anahtarı: parametre sırasından bağımsızdır (aynı istek farklı sırayla yazılsa da aynı kayda düşer). */
export function anahtar(url: string, params: Parametre): string {
  return `${url}?${Object.keys(params).sort().map((k) => `${k}=${metin(params[k]!)}`).join("&")}`;
}

export function istemciOlustur(ayar: IstemciAyar): Istemci {
  const { depo } = ayar;
  const indir = ayar.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const simdi = ayar.simdi ?? (() => new Date());
  const zamanAsimi = ayar.zamanAsimiMs ?? 90_000;
  const suren = new Map<string, Promise<Yanit>>();

  async function agdan(url: string, params: Parametre, sure: number): Promise<string> {
    const kesici = new AbortController();
    const sayac = setTimeout(() => kesici.abort(), sure);
    let r: Response;
    let govde: string;
    try {
      r = await indir(adres(url, params), { signal: kesici.signal });
      govde = await r.text();
    } catch (e) {
      throw new VeriHatasi("ag", "Veri alınamadı", e instanceof Error ? e.message : String(e));
    } finally {
      clearTimeout(sayac);
    }
    if (!r.ok) {
      let neden = "";
      try {
        const js: unknown = JSON.parse(govde);
        if (js && typeof js === "object" && "reason" in js) neden = String(js.reason);
      } catch { /* gövde JSON değil: neden boş kalır */ }
      const sinir = r.status === 429;
      throw new VeriHatasi(sinir ? "sinir" : "sunucu", sinir ? "İstek sınırı aşıldı" : "Veri alınamadı", neden, r.status);
    }
    return govde;
  }

  const coz = (govde: string, duz: boolean): unknown => (duz ? govde : JSON.parse(govde));

  /** Önceki dönemlerden kalan en yeni okunabilir kayıt. */
  async function sonKayit(kok: string, duz: boolean): Promise<{ veri: unknown; donem: string } | null> {
    const on = `${kok}|`;
    const adaylar = (await depo.anahtarlar()).filter((a) => a.startsWith(on)).sort().reverse();
    for (const a of adaylar) {
      const k = await depo.al(a);
      if (!k) continue;
      try {
        return { veri: coz(k.govde, duz), donem: a.slice(on.length) };
      } catch { /* bozuk kayıt: atla */ }
    }
    return null;
  }

  async function getirTek(url: string, params: Parametre, d: string, secenek: GetirSecenek): Promise<Yanit> {
    const duz = secenek.metin === true;
    const kok = anahtar(url, params);
    const tam = `${kok}|${d}`;
    const kayit = await depo.al(tam);
    if (kayit) {
      try {
        return { veri: coz(kayit.govde, duz), bilgi: { donem: d, kaynak: "onbellek" } };
      } catch {
        await depo.sil(tam);                       // bozuk kayıt: sil, ağdan yeniden al
      }
    }
    try {
      const govde = await agdan(url, params, secenek.zamanAsimiMs ?? zamanAsimi);
      if (!govde.trim()) return { veri: null, bilgi: { donem: d, kaynak: "ag" } };
      let veri: unknown;
      try {
        veri = coz(govde, duz);
      } catch {
        throw new VeriHatasi("bicim", "Yanıt okunamadı", "Sunucu JSON olmayan bir yanıt döndürdü");
      }
      const an = simdi().getTime();
      await depo.yaz(tam, secenek.omurGun ? { zaman: an, govde, omurMs: secenek.omurGun * GUN_MS } : { zaman: an, govde });
      await depo.temizle(an);                      // ömrü dolan (varsayılan: bir günden eski) yanıtları temizle
      return { veri, bilgi: { donem: d, kaynak: "ag" } };
    } catch (e) {
      const eski = await sonKayit(kok, duz);
      if (eski) return { veri: eski.veri, bilgi: { donem: eski.donem, kaynak: "eski" } };
      throw e;
    }
  }

  return {
    getir<T>(url: string, params: Parametre, secenek: GetirSecenek = {}): Promise<Yanit<T>> {
      const d = secenek.donem ?? (secenek.gunluk ? gunDonemi(simdi()) : donem(simdi()));
      const tam = `${anahtar(url, params)}|${d}`;
      let is = suren.get(tam);
      if (!is) {
        is = getirTek(url, params, d, secenek).finally(() => suren.delete(tam));
        suren.set(tam, is);
      }
      return is as Promise<Yanit<T>>;
    },
  };
}

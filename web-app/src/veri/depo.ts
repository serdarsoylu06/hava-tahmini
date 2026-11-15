/** Yanıt önbelleğinin saklandığı yer. Streamlit sürümündeki .onbellek/ klasörünün tarayıcıdaki karşılığı:
 * kayıtlar sayfa yenilense de, sekme kapansa da durur. */

export interface Kayit {
  /** Kaydın yazıldığı an (epoch ms). */
  zaman: number;
  /** API yanıtının ham metni. */
  govde: string;
  /** Kaydın saklanma süresi (ms). Verilmezse bir gün; aylık arşiv gibi uzun ömürlü kayıtlar bunu büyütür. */
  omurMs?: number;
}

export const GUN_MS = 86_400_000;
/** Kaydın süresi dolmuş mu? */
export const eskidi = (k: Kayit, an: number) => an - k.zaman > (k.omurMs ?? GUN_MS);

export interface Depo {
  al(anahtar: string): Promise<Kayit | null>;
  yaz(anahtar: string, kayit: Kayit): Promise<void>;
  sil(anahtar: string): Promise<void>;
  anahtarlar(): Promise<string[]>;
  /** `an` (epoch ms) itibarıyla ömrü dolmuş bütün kayıtları siler. */
  temizle(an: number): Promise<void>;
}

/** Bellekte tutulan depo: testlerde ve IndexedDB'nin kullanılamadığı durumlarda (ör. bazı gizli sekmeler). */
export class BellekDepo implements Depo {
  private readonly kayitlar = new Map<string, Kayit>();

  async al(anahtar: string) { return this.kayitlar.get(anahtar) ?? null; }
  async yaz(anahtar: string, kayit: Kayit) { this.kayitlar.set(anahtar, kayit); }
  async sil(anahtar: string) { this.kayitlar.delete(anahtar); }
  async anahtarlar() { return [...this.kayitlar.keys()]; }
  async temizle(an: number) {
    for (const [a, k] of this.kayitlar) if (eskidi(k, an)) this.kayitlar.delete(a);
  }
}

const VT = "havalab", TABLO = "yanitlar";

/** IndexedDB deposu. localStorage yerine bu seçildi: 10 günlük saatlik yanıtlar 100 KB'ı bulur ve
 * localStorage'ın ~5 MB sınırı birkaç konumda dolar. */
export class TarayiciDepo implements Depo {
  private vt: Promise<IDBDatabase> | null = null;

  private ac(): Promise<IDBDatabase> {
    this.vt ??= new Promise((coz, reddet) => {
      const istek = indexedDB.open(VT, 1);
      istek.onupgradeneeded = () => istek.result.createObjectStore(TABLO);
      istek.onsuccess = () => coz(istek.result);
      istek.onerror = () => reddet(istek.error);
    });
    return this.vt;
  }

  private async islem<T>(kip: IDBTransactionMode, is: (t: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const vt = await this.ac();
    return new Promise((coz, reddet) => {
      const istek = is(vt.transaction(TABLO, kip).objectStore(TABLO));
      istek.onsuccess = () => coz(istek.result);
      istek.onerror = () => reddet(istek.error);
    });
  }

  async al(anahtar: string) { return (await this.islem<Kayit | undefined>("readonly", (t) => t.get(anahtar))) ?? null; }
  async yaz(anahtar: string, kayit: Kayit) { await this.islem("readwrite", (t) => t.put(kayit, anahtar)); }
  async sil(anahtar: string) { await this.islem("readwrite", (t) => t.delete(anahtar)); }
  async anahtarlar() { return (await this.islem("readonly", (t) => t.getAllKeys())).map(String); }
  async temizle(an: number) {
    for (const a of await this.anahtarlar()) {
      const k = await this.al(a);
      if (k && eskidi(k, an)) await this.sil(a);
    }
  }
}

/** Depo hata verirse (kota dolu, gizli sekme, bozuk veritabanı) uygulama durmasın: sessizce belleğe düşer. */
export class GuvenliDepo implements Depo {
  private yedek: BellekDepo | null = null;
  constructor(private readonly asil: Depo) {}

  private async dene<T>(is: (d: Depo) => Promise<T>): Promise<T> {
    if (this.yedek) return is(this.yedek);
    try {
      return await is(this.asil);
    } catch {
      this.yedek = new BellekDepo();
      return is(this.yedek);
    }
  }

  al(anahtar: string) { return this.dene((d) => d.al(anahtar)); }
  yaz(anahtar: string, kayit: Kayit) { return this.dene((d) => d.yaz(anahtar, kayit)); }
  sil(anahtar: string) { return this.dene((d) => d.sil(anahtar)); }
  anahtarlar() { return this.dene((d) => d.anahtarlar()); }
  temizle(an: number) { return this.dene((d) => d.temizle(an)); }
}

/** Tarayıcıda kalıcı depo, IndexedDB yoksa bellek. */
export function depoOlustur(): Depo {
  return typeof indexedDB === "undefined" ? new BellekDepo() : new GuvenliDepo(new TarayiciDepo());
}

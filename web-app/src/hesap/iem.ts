/** Iowa Environmental Mesonet (IEM) METAR arşivine istekler. IEM bir adresten saniyede yaklaşık bir isteğe izin
 * verir, fazlasını 429 ile geri çevirir. Bu yüzden istekler sıraya konur, aralarında beklenir ve geri çevrilen
 * istek birkaç kez yeniden denenir. Önbellekten dönen yanıt beklemeye yol açmaz. */
import { type GetirSecenek, type Istemci, type Parametre, VeriHatasi, type Yanit } from "../veri/istemci";

export const IEM = "https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py";
/** İki ağ isteği arasında bırakılan süre. */
export const ARALIK_MS = 1300;
export const YENIDEN_DENEME = 2;

const uyu = (ms: number) => new Promise<void>((tamam) => setTimeout(tamam, ms));

/** Sıralı, aralıklı ve yeniden denemeli istek kuyruğu kurar (testlerde saat ve bekleme dışarıdan verilir). */
export function iemKuyrugu(simdi: () => number = Date.now, bekle: (ms: number) => Promise<void> = uyu) {
  let sira: Promise<unknown> = Promise.resolve();
  let sonIstek = -Infinity;
  return function getir(istemci: Istemci, params: Parametre, secenek: GetirSecenek = {}): Promise<Yanit<string>> {
    const calis = async (): Promise<Yanit<string>> => {
      for (let deneme = 0; ; deneme++) {
        const kalan = sonIstek + ARALIK_MS - simdi();
        if (kalan > 0) await bekle(kalan);
        try {
          const yanit = await istemci.getir<string>(IEM, params, { ...secenek, metin: true });
          if (yanit.bilgi.kaynak === "ag") sonIstek = simdi();
          return yanit;
        } catch (e) {
          sonIstek = simdi();
          if (!(e instanceof VeriHatasi && e.tur === "sinir" && deneme < YENIDEN_DENEME)) throw e;
        }
      }
    };
    const sonuc = sira.then(calis, calis);
    sira = sonuc.catch(() => undefined);
    return sonuc;
  };
}

/** Uygulamanın tek IEM kuyruğu. */
export const iemGetir = iemKuyrugu();

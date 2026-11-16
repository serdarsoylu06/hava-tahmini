/** Tahmin okuma rehberi: telefondaki tek bir simgenin arkasında ne olduğunu anlamak için kısa bir rehber.
 * Streamlit'teki `app_pages/ogren.py` sayfasının karşılığı. Bu sayfa veri indirmez. */
import { useMemo } from "react";
import { Cizelge, IpucuBasligi, IpucuSatiri, type Panel } from "../grafik/Cizelge";
import { Bolum, BolumCubugu, SayfaBasligi } from "./ortak";

type Hedef = "basit" | "harita" | "dogrulama";

const ADIMLAR: readonly { baslik: string; metin: string; nerede: string; hedef: Hedef }[] = [
  { baslik: "Önce uyarılara bak", metin: "“Nelere dikkat etmeli?” kartları, tahmin verisinde eşik aşan olayları listeler. Kırmızı = tehlike, sarı = dikkat, mavi = bilgi.", nerede: "Basit mod", hedef: "basit" },
  { baslik: "Basıncın eğilimini izle", metin: "Basınç düşüyorsa sistem yaklaşıyor, yükseliyorsa hava açıyor demektir. Değerden çok değişim hızı önemlidir.", nerede: "Harita ve analiz → Meteogram", hedef: "harita" },
  { baslik: "Modeller anlaşıyor mu?", metin: "Farklı merkezlerin modelleri aynı şeyi söylüyorsa güven yüksektir. Ayrıştıkları tarihi not et.", nerede: "Harita ve analiz → Modeller", hedef: "harita" },
  { baslik: "Senaryolara bak", metin: "Tek sayıya değil, senaryolara bak: 3–4 günden sonrası için ansambl bandı tek tahminden daha dürüsttür. “%30 yağış” yağmayacak demek değildir.", nerede: "Harita ve analiz → Ansambl", hedef: "harita" },
  { baslik: "Büyük resmi haritada gör", metin: "Sistemin nereden geldiğini ve ne hızla ilerlediğini görmek, zamanlamadaki hatayı tahmin etmeni sağlar.", nerede: "Harita ve analiz", hedef: "harita" },
];

// ECMWF'nin yayımladığı tipik başarı eğrisinin yaklaşık, öğretici bir gösterimi (ölçüm değil)
const BECERI = [98, 96, 93, 89, 84, 78, 71, 64, 56, 48, 41, 35, 30, 26, 23];
const BOLGELER: readonly { ad: string; renk: string; son: number }[] = [
  { ad: "Güvenilir", renk: "#2F9E44", son: 3 }, { ad: "İyi", renk: "#8FB52A", son: 7 }, { ad: "Eğilim", renk: "#D69A00", son: 10 }, { ad: "İklim ortalamasına yakın", renk: "#C8372D", son: 15 },
];
const bolge = (gun: number) => BOLGELER.find((b) => gun <= b.son)!;

const SOZLUK: readonly (readonly [string, string, string])[] = [
  ["Çiy noktası", "Havanın doyması için soğuması gereken sıcaklık. Sıcaklığa ne kadar yakınsa hava o kadar nemli.", "Nem konforunun en iyi ölçüsü: 10° kuru, 16° nemli, 20° bunaltıcı."],
  ["Hissedilen sıcaklık", "Rüzgâr ve nemin etkisiyle vücudun algıladığı sıcaklık.", "Kışın rüzgâr soğutur, yazın nem ısıtır."],
  ["Hamle", "Birkaç saniyelik en kuvvetli rüzgâr esintisi.", "Hasarı ortalama rüzgâr değil hamle verir."],
  ["İzobar", "Haritada eşit basınçlı noktaları birleştiren çizgi.", "Sıklaştıkça rüzgâr kuvvetlenir."],
  ["Alçak basınç", "Çevresine göre basıncı düşük bölge; hava yükselir.", "Bulut, yağış, rüzgâr getirir."],
  ["Yüksek basınç", "Çevresine göre basıncı yüksek bölge; hava çöker.", "Açık, durgun hava; kışın sis ve don."],
  ["Cephe", "Farklı sıcaklıktaki iki hava kütlesinin sınırı.", "Geçerken rüzgâr döner, basınç dibe vurur, yağış olur."],
  ["Donma seviyesi", "Havanın 0 °C olduğu yükseklik.", "Yere 300–400 m yaklaşınca yağış kara döner."],
  ["850 hPa", "Yaklaşık 1,5 km yükseklik; hava kütlesinin “gerçek” sıcaklığı.", "−4 °C altı genellikle kar."],
  ["500 hPa", "Yaklaşık 5,5 km yükseklik; sistemleri yönlendiren akış.", "Oluk = kötü hava, sırt = iyi hava."],
  ["CAPE", "Yükselen havanın kazanabileceği enerji (J/kg).", "1000 üstü gök gürültülü sağanak potansiyeli."],
  ["CIN", "Yükselmeyi engelleyen enerji (“kapak”).", "Kapak kırılırsa ani fırtınalar."],
  ["Ansambl", "Aynı modelin hafifçe farklı başlangıçlarla onlarca kez çalıştırılması.", "Yağış olasılığı buradan hesaplanır."],
  ["Yağış olasılığı", "Ansambl üyelerinin yüzde kaçının yağış verdiği.", "%30 = 10 senaryodan 3'ünde yağış var; “yağmayacak” demek değil."],
  ["WMO kodu", "Dünya Meteoroloji Örgütü'nün hava durumu kodları (0 açık … 99 dolulu fırtına).", "Uygulamadaki simgeler bu kodlardan gelir."],
];

export function Ogren({ git }: { git: (hedef: Hedef) => void }) {
  return (
    <div className="sy">
      <SayfaBasligi baslik="Bir hava tahmini nasıl okunur?">Telefondaki tek bir simgenin arkasında ne olduğunu anlamak için kısa bir rehber.</SayfaBasligi>
      <BolumCubugu />

      <Bolum baslik="5 adımda tahmin okumak" kisa="5 adım" />
      <ol className="og-adimlar">
        {ADIMLAR.map((a, i) => (
          <li key={a.baslik} className="yz sy-kart">
            <span className="og-no" aria-hidden="true">{i + 1}</span>
            <h3>{a.baslik}</h3>
            <p>{a.metin}</p>
            <button type="button" className="baglanti" onClick={() => git(a.hedef)}>{a.nerede.replaceAll(" → ", " · ")} →</button>
          </li>
        ))}
      </ol>

      <Bolum baslik="Tahmin ne kadar ileriye güvenilir?" kisa="Güvenilirlik" />
      <div className="sy-iki">
        <section className="ak" aria-label="Tahmin becerisinin gün sayısıyla azalması">
          <ul className="sev-lejant" aria-label="Bölgelerin anlamı">{BOLGELER.map((b) => <li key={b.ad}><i style={{ background: b.renk, opacity: 0.55 }} />{b.ad}</li>)}</ul>
          <BeceriEgrisi />
          <p className="ak-ac">Temsili eğri: büyük ölçekli basınç düzeni için tipik beceri. Yağış ve yerel olaylarda beceri daha hızlı düşer.</p>
        </section>
        <section className="yz sy-kart og-liste">
          <ul>
            <li><strong>1–3 gün:</strong> Sıcaklık ±1–2 °C, sistemlerin yeri ve zamanı oldukça kesin.</li>
            <li><strong>4–7 gün:</strong> Genel durum doğru, ayrıntılar (yağışın saati, miktarı) kayabilir.</li>
            <li><strong>8–10 gün:</strong> Yalnızca eğilim: “serinleşme”, “yağışlı bir dönem”.</li>
            <li><strong>10+ gün:</strong> Tek tek günler için tahmin, mevsim normallerinden pek iyi değildir.</li>
          </ul>
          <p>Atmosfer <strong>kaotik</strong> bir sistemdir: başlangıçtaki küçük ölçüm hataları her gün katlanarak büyür. Bu yüzden modeller ne kadar iyileşirse iyileşsin hava tahmininin pratik sınırı yaklaşık iki haftadır.</p>
          <button type="button" className="baglanti" onClick={() => git("dogrulama")}>Bu hafta ne kadar tuttu? →</button>
        </section>
      </div>

      <Bolum baslik="Sözlük" />
      <div className="yz sy-kart sy-tablo og-sozluk">
        <table>
          <thead><tr><th scope="col">Terim</th><th scope="col">Anlamı</th><th scope="col">Pratikte</th></tr></thead>
          <tbody>{SOZLUK.map(([terim, anlam, pratik]) => <tr key={terim}><th scope="row">{terim}</th><td>{anlam}</td><td>{pratik}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

function BeceriEgrisi() {
  const c = useMemo(() => {
    const paneller: Panel[] = [{ baslik: "Tahmin becerisi (%)", boy: 220, ustBosluk: 26, taban: 0, tavan: 100, cizgiler: [0, 25, 50, 75, 100], seriler: [
      { tur: "serit", renkler: BECERI.map((_, i) => `${bolge(i + 1).renk}2E`) },
      { tur: "cizgi", deger: BECERI, renk: "#2A6FB0", kalinlik: 2.5, etiket: { enAz: 56, bicim: (v) => `%${v}` } },
    ] }];
    return {
      paneller,
      xEtiket: (i: number) => `${i + 1}`,
      ipucu: (i: number) => <><IpucuBasligi>{i + 1} gün sonrası</IpucuBasligi><IpucuSatiri renk="#2A6FB0" ad="Beceri" deger={`%${BECERI[i]}`} /><IpucuSatiri ad="Bölge" deger={bolge(i + 1).ad} /></>,
      tablo: { basliklar: ["Kaç gün sonrası", "Beceri %", "Bölge"], satir: (i: number) => [String(i + 1), String(BECERI[i]), bolge(i + 1).ad] },
    };
  }, []);
  return <Cizelge n={BECERI.length} bant paneller={c.paneller} xEtiket={c.xEtiket} ipucu={c.ipucu} tablo={c.tablo} etiket="Tahmin becerisinin gün sayısıyla azalması (temsili)" />;
}

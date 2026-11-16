/** Atmosfer profili: seçili noktanın üzerindeki atmosferin yerden ~12 km'ye kadar dikey kesiti (skew-T) ve ondan
 * okunan kararsızlık ölçüleri. Streamlit'teki `app_pages/profil.py` sayfasının karşılığı; hesaplar `hesap/profil.ts`
 * içinde ve MetPy çıktılarıyla sınanır. */
import { useMemo, useState } from "react";
import { Cizelge, IpucuBasligi, IpucuSatiri, type Panel } from "../grafik/Cizelge";
import { profilKur, profilOzeti, standartYukseklik } from "../hesap/profil";
import { yonAdi } from "../ortak/cografya";
import { gunYaz, zamanYaz } from "../ortak/zaman";
import { apiHatasiMi, nesneMi, tabloDogrula } from "../veri/dogrula";
import { FC, SEVIYELER, simdiden, simdikiSaat } from "../veri/openMeteo";
import type { Tablo } from "../veri/tipler";
import { Bolum, Durum, Not, Olcut, Rehber, type SayfaOzellik, SayfaBasligi, sayi, useVeri } from "./ortak";
import { SkewT } from "./SkewT";

const TURUNCU = "#B2602A";
const DEGISKENLER = ["surface_pressure", "temperature_2m", "dew_point_2m", "wind_speed_10m", "wind_direction_10m", "cape", "precipitation_probability",
                     ...SEVIYELER.flatMap((p) => ["temperature", "relative_humidity", "wind_speed", "wind_direction"].map((x) => `${x}_${p}hPa`))];
/** Profil üç saatte bir seçilir. */
const ARALIK = 3;

function durum(cape: number): { ad: string; tur: "iyi" | "dikkat" | "tehlike" } {
  return cape < 100 ? { ad: "Kararlı", tur: "iyi" } : cape < 1000 ? { ad: "Zayıf kararsız", tur: "dikkat" } : cape < 2500 ? { ad: "Orta kararsız", tur: "dikkat" } : { ad: "Güçlü kararsız", tur: "tehlike" };
}

function yorum(cape: number, cin: number): string {
  if (cape < 100) return "Yükselen hava kısa sürede çevresinden soğuk kalıp geri iniyor. Dikey bulut gelişimi beklenmez.";
  if (cin < -50) return "Enerji var ama güçlü bir “kapak” da var. Kapak bir tetikle (cephe, dağ yamacı, öğleden sonra ısınması) kırılırsa ani ve kuvvetli sağanaklar gelişebilir.";
  if (cape < 1000) return "Küçük kümülüs bulutları ve kısa süreli sağanaklar olabilir.";
  if (cape < 2500) return "Gök gürültülü sağanak için yeterli enerji var; öğleden sonra saatleri en riskli dönemdir.";
  return "Dolu, ani kuvvetli rüzgâr ve şiddetli fırtına potansiyeli taşıyan çok enerjik bir atmosfer.";
}

export function Profil({ istemci, konum, tahmin }: SayfaOzellik) {
  const [gun, setGun] = useState(5);
  const tz = tahmin.tz;
  const d = useVeri(async () => {
    const { veri } = await istemci.getir(FC, { latitude: konum.lat, longitude: konum.lon, hourly: DEGISKENLER.join(","), forecast_days: gun, timezone: tz });
    apiHatasiMi(veri);
    return { tablo: simdiden(tabloDogrula(nesneMi(veri) ? veri.hourly : null), simdikiSaat(tz)), gun };
  }, [istemci, konum.lat, konum.lon, tz, gun]);
  return (
    <div className="sy">
      <SayfaBasligi baslik="Atmosfer profili" yer={konum.ad}
                    sag={<div className="an-cipler" role="group" aria-label="Dönem">
                      {[2, 5, 7].map((g) => <button key={g} type="button" className="cip" aria-pressed={g === gun} onClick={() => setGun(g)}>{g} gün</button>)}
                    </div>}>
        Bulunduğun noktanın üzerindeki atmosferin yerden ~12 km'ye kadar dikey kesiti. Gök gürültülü sağanak, kar–yağmur sınırı ve bulut tabanı bu grafikten okunur.
      </SayfaBasligi>
      <Durum d={d}>
        {(v) => (v.tablo.zaman.length
          ? <Icerik key={`${konum.lat},${konum.lon},${v.gun}`} t={v.tablo} yer={konum.ad} />
          : <p className="an-not an-hata" role="alert">Bu konum için üst seviye verisi alınamadı.</p>)}
      </Durum>
      <Rehber baslik="Skew-T diyagramı adım adım nasıl okunur?" adimlar={[
        ["Eksenler", "Dikey eksen basınçtır; yukarı çıktıkça azalır (850 hPa ≈ 1,5 km, 500 hPa ≈ 5,5 km). Sıcaklık çizgileri 45° sağa eğik çizilir, bu yüzden adı “skew-T”dir."],
        ["Kırmızı ve yeşil çizgi", "Kırmızı havanın sıcaklığı, yeşil çiy noktasıdır. İkisinin birbirine değdiği katmanlarda hava doymuştur, yani bulut vardır. Aralarının açık olduğu katmanlar kurudur."],
        ["Kesikli çizgi: yükselen parsel", "Yerden yükseltilen bir hava kabarcığının sıcaklığıdır. Parsel çevresinden sıcaksa (kesikli çizgi kırmızının sağında) kaldırma kuvvetiyle yükselmeye devam eder. Bu alan kırmızıyla gölgelenir ve büyüklüğü **CAPE**'tir."],
        ["Mavi gölge: CIN", "Parselin çevresinden soğuk kaldığı, yükselmenin engellendiği “kapak” katmanıdır."],
        ["Mavi noktalı eğik çizgi", "0 °C çizgisi. Kırmızı çizginin bunu kestiği yükseklik donma seviyesidir. Yere yakın bir yerde kırmızı çizgi 0 °C'nin sağına geçip sonra yeniden soluna dönüyorsa (sıcak burun) donan yağmur riski vardır."],
        ["Rüzgâr bayrakları", "Sağdaki bayraklar her seviyedeki rüzgârı gösterir (kısa çizgi 5, uzun 10, üçgen 50 knot). Yükseklikle yönü dönen ve hızlanan rüzgâr (rüzgâr kesmesi) fırtınaların daha organize ve uzun ömürlü olmasına yol açar."],
      ]} />
      <p className="sy-acil">Not: Model verisi 10 basınç seviyesinden geldiği için gerçek radyosonde (balon) ölçümü kadar ayrıntılı değildir. CAPE, CIN ve bulut tabanı bu sayfada profilden yeniden hesaplanır; zaman çizelgesindeki CAPE ise modelin kendi çıktısıdır, ikisi birebir aynı olmayabilir.</p>
    </div>
  );
}

function Icerik({ t, yer }: { t: Tablo; yer: string }) {
  const cape = t.sutun.cape ?? [], olasilik = t.sutun.precipitation_probability ?? [];
  const son = Math.floor((t.zaman.length - 1) / ARALIK) * ARALIK;
  // açılışta en kararsız saat gösterilir (anlamlı bir kararsızlık yoksa ilk saat)
  const [secili, setSecili] = useState(() => {
    let tepe = 0;
    for (let i = 0; i <= son; i += ARALIK) if ((cape[i] ?? -1) > (cape[tepe] ?? -1)) tepe = i;
    return (cape[tepe] ?? 0) >= 100 ? tepe : 0;
  });
  const profil = useMemo(() => profilKur((ad) => t.sutun[ad]?.[secili]), [t, secili]);
  const ozet = useMemo(() => (profil && profil.p.length >= 3 ? profilOzeti(profil) : null), [profil]);

  const c = useMemo(() => {
    const enCok = Math.max(0, ...cape.map((x) => x ?? 0)), ust = Math.max(1200, enCok * 1.15);
    const paneller: Panel[] = [{ baslik: "CAPE (J/kg), modelin çıktısı", boy: 150, taban: 0, tavan: Math.ceil(ust / 100) * 100, hedef: 4, isaret: [secili],
      esik: [{ deger: 100, renk: "#8A8F2A", ad: "100: zayıf" }, { deger: 1000, renk: "#C8621A", ad: "1000: orta" }, { deger: 2500, renk: "#B5352B", ad: "2500: güçlü" }].filter((e) => e.deger <= ust),
      seriler: [{ tur: "cizgi", deger: cape, renk: TURUNCU, kalinlik: 2, dolgu: true, duz: true }] }];
    return {
      paneller,
      xEtiket: (i: number) => (t.zaman[i]!.endsWith("T00:00") ? gunYaz(t.zaman[i]!) : t.zaman[i]!.endsWith("T12:00") ? "12" : null),
      dikey: (i: number) => t.zaman[i]!.endsWith("T00:00"),
      ipucu: (i: number) => <><IpucuBasligi>{zamanYaz(t.zaman[i]!)}</IpucuBasligi><IpucuSatiri renk={TURUNCU} ad="CAPE" deger={`${sayi(cape[i])} J/kg`} /><IpucuSatiri ad="Yağış olasılığı" deger={`%${sayi(olasilik[i])}`} /></>,
      tablo: { basliklar: ["Zaman", "CAPE J/kg", "Yağış olasılığı %"], satir: (i: number) => [zamanYaz(t.zaman[i]!), sayi(cape[i]), sayi(olasilik[i])] },
    };
  }, [t, cape, olasilik, secili]);

  const an = zamanYaz(t.zaman[secili]!);
  return (
    <>
      <Bolum baslik="Kararsızlık zaman çizelgesi" aciklama="Bir ana dokunarak o saatin profilini aç" />
      <section className="ak" aria-label="CAPE zaman serisi">
        <Cizelge n={t.zaman.length} paneller={c.paneller} xEtiket={c.xEtiket} dikey={c.dikey} ipucu={c.ipucu} tablo={c.tablo} etiket="CAPE zaman serisi"
                 sec={(i) => setSecili(Math.min(Math.round(i / ARALIK) * ARALIK, son))} />
      </section>
      <label className="pr-zaman">
        <span>Zaman: <strong>{an}</strong></span>
        <input type="range" min={0} max={son} step={ARALIK} value={secili} onChange={(e) => setSecili(Number(e.target.value))} aria-valuetext={an} />
      </label>

      {profil && ozet ? (
        <div className="sy-iki pr-iki">
          <section className="ak" aria-label="Skew-T log-P diyagramı">
            <SkewT profil={profil} ozet={ozet} baslik={`${yer}, ${an}`} />
            <details className="cz-tablo">
              <summary>Seviyeleri tablo olarak göster</summary>
              <div className="cz-tablo-ic" tabIndex={0} role="region" aria-label="Profil seviyeleri">
                <table>
                  <thead><tr>{["Basınç hPa", "Yükseklik m", "Sıcaklık °C", "Çiy noktası °C", "Parsel °C", "Rüzgâr"].map((b) => <th key={b} scope="col">{b}</th>)}</tr></thead>
                  <tbody>{profil.p.map((p, i) => {
                    const hiz = Math.hypot(profil.u[i]!, profil.v[i]!), yon = ((Math.atan2(-profil.u[i]!, -profil.v[i]!) * 180) / Math.PI + 360) % 360;
                    return <tr key={p}><th scope="row">{sayi(p, i ? 0 : 1)}{i ? "" : " (yer)"}</th><td>{sayi(standartYukseklik(p))}</td><td>{sayi(profil.T[i], 1)}</td><td>{sayi(profil.Td[i], 1)}</td><td>{sayi(ozet.parsel[i], 1)}</td><td>{yonAdi(yon)} {sayi(hiz)} kt</td></tr>;
                  })}</tbody>
                </table>
              </div>
            </details>
          </section>
          <div className="sy-yigin">
            <div className={`uy ${durum(ozet.cape).tur}`}><h3>Atmosfer durumu: {durum(ozet.cape).ad}</h3><p>{yorum(ozet.cape, ozet.cin)}</p></div>
            <dl className="olcutler pr-olcut">
              <Olcut baslik="CAPE" deger={`${sayi(ozet.cape)} J/kg`} aciklama="Yükselen havanın kazanabileceği enerji. <100 kararlı, 100–1000 zayıf, 1000–2500 orta, >2500 güçlü kararsızlık. Diyagramdaki kırmızı alanın büyüklüğüdür." />
              <Olcut baslik="CIN" deger={`${sayi(ozet.cin)} J/kg`} aciklama="Yükselmeyi engelleyen “kapak”. −50'den daha negatifse fırtınaların başlaması için güçlü bir tetik (cephe, dağ, gündüz ısınması) gerekir. Mavi alan." />
              <Olcut baslik="Bulut tabanı" deger={`${sayi(ozet.lclM)} m`} aciklama="Yerden yükselen havanın yoğuşmaya başladığı yükseklik (LCL). Alçak taban: nemli hava, alçak bulutlar." />
              <Olcut baslik="Yağışa dönüşebilir su" deger={`${sayi(ozet.pw)} mm`} aciklama="Sütundaki tüm su buharı yoğuşsaydı oluşacak su. 30 mm üstü yoğun sağanak potansiyelidir." />
            </dl>
            {ozet.donma != null && ozet.donmaM != null && <p className="an-not">0 °C seviyesi ≈ {sayi(ozet.donma)} hPa (deniz seviyesinden yaklaşık {sayi(ozet.donmaM)} m)</p>}
          </div>
        </div>
      ) : <Not tur="dikkat">Bu saat için profil kurulamadı: yer basıncı ya da üst seviye değerleri eksik.</Not>}
    </>
  );
}

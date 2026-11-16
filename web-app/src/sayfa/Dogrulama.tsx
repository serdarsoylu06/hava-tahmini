/** Tahmin doğrulaması: son bir haftada gerçekleşen değerler, aynı saatler için 1–7 gün önce yapılmış tahminlerle
 * karşılaştırılır; ayrıca modeller istasyon ölçümüne göre sıralanır. Streamlit'teki `app_pages/dogrulama.py`
 * sayfasının karşılığı; hesaplar `hesap/dogrulama.ts`, `hesap/olcum.ts` ve `hesap/siralama.ts` içinde. */
import { useMemo, useState } from "react";
import { Cizelge, IpucuBasligi, IpucuSatiri, type Panel, type Seri } from "../grafik/Cizelge";
import { eksen, renkAra } from "../grafik/olcek";
import { ekranRengi } from "../grafik/renk";
import { useKoyuTema } from "../kabuk/tema";
import { DEGISKENLER, enBuyukIska, GUN_ONCE, gunlukToplam, hataOzeti, type HataSatiri, onceki, satirSec, temsilHatasi } from "../hesap/dogrulama";
import { enYakinOlcum, type OlcumIstasyonu } from "../hesap/olcum";
import { gozlemler, MODELLER, ONCEKI, siralama, type SiraSatiri, tahminler, ufuk } from "../hesap/siralama";
import { ceyrek } from "../ortak/dizi";
import { gunYaz, zamanYaz } from "../ortak/zaman";
import { apiHatasiMi, nesneMi, tabloDogrula } from "../veri/dogrula";
import { simdikiSaat } from "../veri/openMeteo";
import type { Deger, Tablo } from "../veri/tipler";
import { Serit } from "../kabuk/Serit";
import { Bolum, Durum, isaretli, kalin, Not, Olcut, Rehber, type SayfaOzellik, SayfaBasligi, sayi, useVeri } from "./ortak";

const MUREKKEP = "#1C2829", GRI = "#6F7F76";
/** Tahmin serilerinin renkleri (gerçekleşen her zaman mürekkep rengidir). */
const RENKLER = ["#2A6FB0", "#B2602A", "#B5352B", "#6B4FA0", "#1F8A66", "#6F7F76", "#A03A78", "#2E6B3A"];
const GRUP_RENK = ["#2E6B3A", "#2A6FB0", "#6B4FA0", "#B2602A", "#B5352B", "#6F7F76"];
const UFUKLAR: readonly (readonly [string, number])[] = [["+24 sa", 1], ["+48 sa", 2], ["+72 sa", 3]];
type Kaynak = "istasyon" | "analiz";

export function Dogrulama({ istemci, konum, tahmin }: SayfaOzellik) {
  const [ad, setAd] = useState("Sıcaklık");
  const [kaynak, setKaynak] = useState<Kaynak>("istasyon");
  const tz = tahmin.tz;
  const { degisken, birim, tolerans } = DEGISKENLER[ad]!;
  const yagis = degisken === "precipitation";

  // en yakın istasyon ve ölçümleri: hem karşılaştırma hem model sıralaması için (tek sefer indirilir)
  const olcum = useVeri(() => enYakinOlcum(istemci, konum.lat, konum.lon, tz), [istemci, konum.lat, konum.lon, tz]);
  const istasyonHazir = olcum.tur !== "yukleniyor";
  const bulunan = olcum.tur === "hazir" ? olcum.veri : null;
  const kullanilan = kaynak === "istasyon" && !yagis && bulunan && (bulunan.tablo.sutun[degisken] ?? []).some((x) => x != null) ? bulunan : null;

  const d = useVeri(async () => {
    if (!istasyonHazir) return null;
    const nokta = kullanilan?.istasyon ?? konum;
    const { veri } = await istemci.getir(ONCEKI, { latitude: nokta.lat, longitude: nokta.lon, past_days: 7, forecast_days: 1, timezone: tz,
                                                    hourly: [degisken, ...GUN_ONCE.map((g) => onceki(degisken, g))].join(",") });
    apiHatasiMi(veri);
    const ham = tabloDogrula(nesneMi(veri) ? veri.hourly : null);
    const simdi = simdikiSaat(tz);
    let t = satirSec(ham, (i) => ham.zaman[i]! < simdi);
    if (kullanilan) {
      const yer = new Map(kullanilan.tablo.zaman.map((z, i) => [z, i])), o = kullanilan.tablo.sutun[degisken]!;
      t = { zaman: t.zaman, sutun: { ...t.sutun, analiz: t.sutun[degisken]!, [degisken]: t.zaman.map((z) => { const i = yer.get(z); return i === undefined ? null : o[i] ?? null; }) } };
    }
    const dolu = t.sutun[degisken]!;
    t = satirSec(t, (i) => dolu[i] != null);
    // tablo, hangi seçimle üretildiğiyle birlikte döner: seçim değişip yeni veri gelene kadar ekranda eski tablo
    // kalır ve o tablo kendi değişkeniyle çizilmelidir
    return { t: yagis ? gunlukToplam(t) : t, ad, degisken, birim, tolerans, istasyon: kullanilan?.istasyon ?? null };
  }, [istemci, konum.lat, konum.lon, tz, degisken, kullanilan?.istasyon.icao, istasyonHazir]);

  return (
    <div className="sy">
      <SayfaBasligi baslik="Tahmin ne kadar tuttu?">
        Son bir haftada gerçekleşen değerleri, aynı saatler için 1–7 gün önce yapılmış tahminlerle karşılaştırır. Tahminin ne kadar ileriye güvenilebileceğini en iyi bu öğretir.
      </SayfaBasligi>
      <Serit etiket="Değişken" className="sy-serit" secili={ad}>
        {Object.keys(DEGISKENLER).map((k) => <button key={k} type="button" className="cip" aria-pressed={k === ad} onClick={() => setAd(k)}>{k}</button>)}
      </Serit>
      {/* kaynak seçimi ayrı satırda: değişken çipleriyle aynı şeritteyken telefonda ekranın dışında kalıyordu */}
      <div className="anahtar tam dg-kaynak" role="group" aria-label="Neyle karşılaştırılsın?">
        <button type="button" aria-pressed={kaynak === "istasyon"} onClick={() => setKaynak("istasyon")}>İstasyon ölçümü</button>
        <button type="button" aria-pressed={kaynak === "analiz"} onClick={() => setKaynak("analiz")}>Model analizi</button>
      </div>
      {kaynak === "istasyon" && yagis && <Not>Havalimanı raporları (METAR) yağış miktarı içermez; yağış için model analiziyle karşılaştırılıyor.</Not>}
      {kaynak === "istasyon" && !yagis && istasyonHazir && !kullanilan && <Not tur="dikkat">120 km içinde ölçümüne ulaşılabilen bir havalimanı istasyonu yok; model analiziyle karşılaştırılıyor.</Not>}
      {kullanilan && (
        <details className="dg-istasyon">
          <summary><span><b>{kullanilan.istasyon.icao}</b> {kullanilan.istasyon.ad} · {sayi(kullanilan.istasyon.km)} km uzakta · rakım {kullanilan.istasyon.rakim ?? "?"} m</span></summary>
          <p>{kalin(`**${kullanilan.istasyon.ad}** (${kullanilan.istasyon.icao}) istasyonunun ölçümleri kullanılıyor: konumuna ${sayi(kullanilan.istasyon.km)} km, rakımı ${kullanilan.istasyon.rakim ?? "?"} m. Tahminler de bu istasyonun koordinatı için alındı.`)}</p>
        </details>
      )}

      <Durum d={d}>
        {(v) => (v && v.t.zaman.length
          ? <Karsilastirma key={`${v.degisken}-${v.istasyon?.icao ?? "analiz"}`} t={v.t} ad={v.ad} degisken={v.degisken} birim={v.birim} tolerans={v.tolerans} istasyon={v.istasyon} yer={konum.ad} />
          : v ? <p className="an-not an-hata" role="alert">Bu dönem için karşılaştırılacak veri yok.</p> : <p className="an-not" role="status">İstasyon aranıyor…</p>)}
      </Durum>

      <Bolum baslik="Hangi model bu istasyonda daha isabetli?" />
      {olcum.tur === "yukleniyor" ? <p className="an-not" role="status">İstasyon aranıyor…</p>
        : bulunan ? <ModelSiralamasi istemci={istemci} istasyon={bulunan.istasyon} yer={konum.ad} />
        : <Not>Sıralama yalnızca gerçek ölçümle yapılır; 120 km içinde ölçümüne ulaşılabilen bir havalimanı istasyonu yok.</Not>}

      <Rehber baslik="Bu karşılaştırma nasıl okunur?" adimlar={[
        ["Gerçekleşen değer nereden geliyor?", "**İstasyon ölçümü**, en yakın havalimanının meteoroloji istasyonunun yayımladığı METAR raporlarıdır (Iowa State Üniversitesi METAR arşivi üzerinden): gerçek termometre, anemometre ve barometre ölçümü. Sıcaklık tam sayı derece raporlanır, yani ±0,5 °C yuvarlama içerir. **Model analizi** ise modelin o saat için gözlemlerle düzeltilmiş en iyi tahminidir; bir ızgara karesinin ortalamasıdır."],
        ["İstasyon ile model neden hiç tam tutmaz?", "Model 9–25 km'lik bir karenin ortalamasını hesaplar; istasyon tek bir noktayı ölçer. Havalimanları çoğunlukla düz, açık yerlerdedir; kıyıda, vadide ya da şehrin içinde fark büyür. “Model analizi ile ölçüm farkı” bu temsil hatasıdır: en iyi tahmin bile bunun altına inemez."],
        ["Ortalama mutlak hata", "Hataların büyüklüğünün ortalamasıdır (işaretine bakmadan). Sıcaklıkta 1 günlük tahmin için 1–2 °C iyi bir değerdir."],
        ["Sistematik sapma", "Hataların işaretli ortalaması. Sıfırdan uzaksa model bu konumda sürekli aynı yönde yanılıyordur; örneğin dağlık bir yerde modelin arazisi gerçekten alçak olduğu için sıcaklığı hep yüksek tahmin etmesi."],
        ["Yağış neden günlük?", "Bir sağanağı doğru tahmin edip bir saat geç gösteren model, saatlik karşılaştırmada iki kez hata yapmış sayılır. Bu yüzden yağış günlük toplamlarla karşılaştırılır."],
        ["Model sıralaması nasıl yapılıyor?", "Her model için o gün gerçekten yayımlanmış tahminler (Open-Meteo geçmiş tahmin arşivi) istasyonun saatlik ölçümleriyle (Iowa State Üniversitesi METAR arşivi) karşılaştırılır. Ölçüm olmayan saatler atlanır, doldurulmaz; bütün modeller aynı saatler üzerinden değerlendirilir (N). **MAE** hatanın ortalama büyüklüğü, **RMSE** büyük hataları daha ağır cezalandıran ortalama, **sapma** ise işaretli ortalamadır."],
        ["Güven aralığı ve gruplar ne demek?", "Başka günler seçilseydi MAE biraz farklı çıkardı. Günler rastgele yeniden seçilerek (bootstrap, 1000 kez) bu oynama ölçülür; çizgi %90 aralığını gösterir. Saatler değil günler seçilir, çünkü bir model bütün gün aynı yönde yanılır ve ardışık saatler bağımsız değildir. Aynı gruptaki modeller arasındaki fark, bu oynamanın içinde kalır: sıralamada onları ayırmak yanıltıcı olur."],
        ["Neden yağış sıralaması yok?", "Türkiye'deki havalimanı raporları (METAR) yağış miktarı içermez; arşivdeki sıfırlar ölçüm değil, boşluktur. Ölçülmemiş bir değerle doğrulama yapılmaz."],
        ["Neden her hafta farklı?", "Kararlı yüksek basınç günlerinde 7 günlük tahmin bile tutar; hızlı geçen cepheler ve sağanaklarda 2 günlük tahmin bile ıskalayabilir. Bu yüzden Ansambl sekmesindeki belirsizlik bandı önemlidir."],
      ]} />
    </div>
  );
}

function Karsilastirma({ t, ad, degisken, birim, tolerans, istasyon, yer }: { t: Tablo; ad: string; degisken: string; birim: string; tolerans: number | null; istasyon: OlcumIstasyonu | null; yer: string }) {
  const [secili, setSecili] = useState<readonly number[]>([1, 3, 6]);
  const ozet = useMemo(() => hataOzeti(t, degisken, tolerans), [t, degisken, tolerans]);
  const temsil = useMemo(() => (istasyon && t.sutun.analiz ? temsilHatasi(t.sutun.analiz, t.sutun[degisken]!) : null), [t, degisken, istasyon]);
  const iska = useMemo(() => enBuyukIska(t, degisken), [t, degisken]);
  const ilk = ozet[0], son = ozet[ozet.length - 1];
  if (!ilk || !son) return <p className="an-not an-hata" role="alert">Geçmiş tahminler bu konum için alınamadı.</p>;
  const kat = son.mae / Math.max(ilk.mae, 0.01);
  const gunluk = degisken === "precipitation";

  return (
    <>
      <dl className="olcutler">
        <Olcut baslik={`${ilk.gun} gün önceki tahminin hatası`} deger={`± ${sayi(ilk.mae, 1)} ${birim}`} aciklama="Ortalama mutlak hata: tahmin ile gerçekleşen arasındaki farkın ortalama büyüklüğü." />
        <Olcut baslik={`${son.gun} gün önceki tahminin hatası`} deger={`± ${sayi(son.mae, 1)} ${birim}`} ek={`${sayi(kat, 1)} kat`} />
        <Olcut baslik={`Sistematik sapma (${ilk.gun} gün)`} deger={`${isaretli(ilk.sapma)} ${birim}`} aciklama="Hataların ortalaması. Artı: model gerçekleşenden yüksek tahmin etmiş; eksi: düşük." />
        {temsil && <Olcut baslik="Model analizi ile ölçüm farkı" deger={`± ${sayi(temsil.mae, 1)} ${birim}`} ek={`sapma ${isaretli(temsil.sapma)}`}
                          aciklama="Modelin “şimdi” için en iyi tahmini bile istasyondan farklıdır: model bir ızgara karesinin ortalamasını, termometre tek bir noktayı ölçer. Buna temsil hatası denir; tahmin hatasının inebileceği bir alt sınır gibidir." />}
      </dl>

      <div className="sy-iki">
        <div>
          <Bolum baslik="Gerçekleşen ve önceden yapılan tahminler" />
          <Serit etiket="Gösterilecek tahminler" className="sy-serit">
            {/* birden çok gün birlikte çizilir: tek seçimli çiplerden ayrışsın diye aç/kapa, onay işaretli */}
            {GUN_ONCE.map((g) => (
              <button key={g} type="button" className="cip onay" aria-pressed={secili.includes(g)}
                      onClick={() => setSecili((s) => (s.includes(g) ? s.filter((x) => x !== g) : [...s, g].sort((a, b) => a - b)))}>
                {secili.includes(g) && <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6.4l2.7 2.7L10 3.3" /></svg>}{g} gün önce
              </button>
            ))}
          </Serit>
          <section className="ak" aria-label="Gerçekleşen ve tahmin edilen değerler">
            <TahminGrafigi t={t} degisken={degisken} baslik={`${ad} (${birim})`} birim={birim} secili={secili} istasyon={istasyon} gunluk={gunluk} />
          </section>
        </div>
        <div>
          <Bolum baslik="Erken yapılan tahminin hatası büyür" />
          <section className="ak" aria-label="Gün önceye göre tahmin hatası">
            <HataGrafigi ozet={ozet} birim={birim} />
            <p className="ak-ac">{son.mae > ilk.mae * 1.3
              ? kalin(`Bu hafta ${yer} için hata, ${ilk.gun} günlük tahminden ${son.gun} günlüğe **${sayi(kat, 1)} kat** büyüdü: atmosferin kaotik doğasının somut bir örneği.`)
              : "Bu hafta hava oldukça kararlı geçmiş: uzun vadeli tahminler bile iyi tutmuş. Her hafta böyle değildir; sistem geçişlerinde fark belirgin açılır."}</p>
          </section>
        </div>
      </div>

      {iska && (
        <Not>{kalin(`Son bir haftanın en büyük ıskası: **${gunluk ? gunYaz(iska.zaman) : zamanYaz(iska.zaman)}** için bir gün önce ${sayi(iska.tahmin, 1)} ${birim} tahmin edilmiş, ${sayi(iska.gercek, 1)} ${birim} gerçekleşmiş. Meteogramda ve haritada o günlerde bir cephe ya da sağanak geçip geçmediğine bakmak, hatanın nedenini anlamanın en iyi yoludur.`)}</Not>
      )}
    </>
  );
}

function TahminGrafigi({ t, degisken, baslik, birim, secili, istasyon, gunluk }: { t: Tablo; degisken: string; baslik: string; birim: string; secili: readonly number[]; istasyon: OlcumIstasyonu | null; gunluk: boolean }) {
  const c = useMemo(() => {
    const z = t.zaman, yaz = gunluk ? gunYaz : zamanYaz;
    const gercekAd = istasyon ? `Ölçüm: ${istasyon.icao}` : "Gerçekleşen (model analizi)";
    // renk "kaç gün önce"ye bağlıdır: seçim değişince kalan çizgiler renk değiştirmez
    const cizgiler: { ad: string; deger: readonly Deger[]; renk: string }[] = [
      ...(istasyon && t.sutun.analiz ? [{ ad: "Model analizi", deger: t.sutun.analiz, renk: RENKLER[7]! }] : []),
      ...secili.map((g) => ({ ad: `${g} gün önce yapılan`, deger: t.sutun[onceki(degisken, g)] ?? z.map(() => null), renk: RENKLER[g - 1]! })),
    ];
    const gercek = t.sutun[degisken]!;
    const seriler: Seri[] = gunluk
      ? [{ tur: "cubuk", ad: gercekAd, deger: gercek, renk: MUREKKEP, grup: [0, cizgiler.length + 1] },
         ...cizgiler.map((s, k): Seri => ({ tur: "cubuk", ad: s.ad, deger: s.deger, renk: s.renk, grup: [k + 1, cizgiler.length + 1] }))]
      : [...cizgiler.map((s): Seri => ({ tur: "cizgi", ad: s.ad, deger: s.deger, renk: s.renk, kalinlik: 1.6 })),
         { tur: "cizgi", ad: gercekAd, deger: gercek, renk: MUREKKEP, kalinlik: 3 }];
    const paneller: Panel[] = [{ baslik, boy: 280, taban: gunluk ? 0 : undefined, hedef: 4, seriler }];
    return {
      paneller,
      xEtiket: (i: number) => (gunluk ? gunYaz(z[i]!) : z[i]!.endsWith("T00:00") ? gunYaz(z[i]!) : z[i]!.endsWith("T12:00") ? "12" : null),
      dikey: gunluk ? undefined : (i: number) => z[i]!.endsWith("T00:00"),
      ipucu: (i: number) => (
        <>
          <IpucuBasligi>{yaz(z[i]!)}</IpucuBasligi>
          <IpucuSatiri renk={MUREKKEP} ad={gercekAd} deger={`${sayi(gercek[i], 1)} ${birim}`} />
          {cizgiler.map((s) => <IpucuSatiri key={s.ad} renk={s.renk} ad={s.ad} deger={`${sayi(s.deger[i], 1)} ${birim}`} />)}
        </>
      ),
      tablo: { basliklar: [gunluk ? "Gün" : "Zaman", gercekAd, ...cizgiler.map((s) => s.ad)], satir: (i: number) => [yaz(z[i]!), sayi(gercek[i], 1), ...cizgiler.map((s) => sayi(s.deger[i], 1))] },
    };
  }, [t, degisken, baslik, birim, secili, istasyon, gunluk]);
  return <Cizelge n={t.zaman.length} bant={gunluk} paneller={c.paneller} xEtiket={c.xEtiket} dikey={c.dikey} ipucu={c.ipucu} tablo={c.tablo} etiket="Gerçekleşen ve tahmin edilen değerler" />;
}

function HataGrafigi({ ozet, birim }: { ozet: readonly HataSatiri[]; birim: string }) {
  const c = useMemo(() => {
    const mae = ozet.map((o) => o.mae), enAz = Math.min(...mae), enCok = Math.max(...mae);
    const paneller: Panel[] = [{ baslik: `Ortalama mutlak hata (${birim})`, boy: 200, ustBosluk: 22, taban: 0, seriler: [
      { tur: "cubuk", deger: mae, renk: GRI, renkler: mae.map((m) => renkAra("#8FB58F", "#B5352B", enCok > enAz ? (m - enAz) / (enCok - enAz) : 0)), etiket: (v) => sayi(v, 1) },
    ] }];
    return {
      paneller,
      xEtiket: (i: number) => `${ozet[i]!.gun} gün`,
      ipucu: (i: number) => (
        <>
          <IpucuBasligi>{ozet[i]!.gun} gün önce yapılan tahmin</IpucuBasligi>
          <IpucuSatiri ad="Ortalama hata" deger={`${sayi(ozet[i]!.mae, 2)} ${birim}`} />
          <IpucuSatiri ad="Sapma (+: fazla tahmin)" deger={`${isaretli(ozet[i]!.sapma, 2)} ${birim}`} />
          <IpucuSatiri ad="İsabet oranı" deger={`%${sayi(ozet[i]!.isabet)}`} />
        </>
      ),
      tablo: { basliklar: ["Kaç gün önce", `Ortalama hata ${birim}`, `Sapma ${birim}`, "İsabet %"], satir: (i: number) => [String(ozet[i]!.gun), sayi(ozet[i]!.mae, 2), isaretli(ozet[i]!.sapma, 2), sayi(ozet[i]!.isabet)] },
    };
  }, [ozet, birim]);
  return <Cizelge n={ozet.length} bant paneller={c.paneller} xEtiket={c.xEtiket} ipucu={c.ipucu} tablo={c.tablo} etiket="Kaç gün önceden yapılan tahminin ortalama mutlak hatası" />;
}

function ModelSiralamasi({ istemci, istasyon, yer }: { istemci: SayfaOzellik["istemci"]; istasyon: OlcumIstasyonu; yer: string }) {
  const [ufukGun, setUfukGun] = useState(1);
  const [donem, setDonem] = useState(90);
  const arsiv = useVeri(async () => {
    const [O, F] = await Promise.all([gozlemler(istemci, istasyon.icao), tahminler(istemci, istasyon)]);
    return O && F && O.zaman.length ? { O, F } : null;
  }, [istemci, istasyon.icao]);
  const sonuc = useMemo(() => (arsiv.tur === "hazir" && arsiv.veri ? siralama(ufuk(arsiv.veri.F, ufukGun), arsiv.veri.O, donem) : null), [arsiv, ufukGun, donem]);

  return (
    <>
      {/* ufuk ve dönem ayrı satırlarda: tek şeritteyken telefonda "Son 90 gün" ekranın dışında kalıyordu */}
      <div className="an-cipler" role="group" aria-label="Tahmin ufku">
        {UFUKLAR.map(([etiket, g]) => <button key={g} type="button" className="cip" aria-pressed={g === ufukGun} onClick={() => setUfukGun(g)}>{etiket}</button>)}
      </div>
      <div className="anahtar tam dg-kaynak" role="group" aria-label="Dönem">
        {[30, 90].map((g) => <button key={g} type="button" aria-pressed={g === donem} onClick={() => setDonem(g)}>Son {g} gün</button>)}
      </div>
      <Durum d={arsiv} bekleme="90 günlük ölçüm ve tahmin arşivi indiriliyor…">
        {() => {
          if (!sonuc?.tablo) return <Not tur="dikkat">İstasyonun ölçüm arşivi ya da geçmiş tahminler şu an alınamadı; sıralama gösterilemiyor.</Not>;
          const { tablo, bilgi } = sonuc;
          const enIyi = tablo.filter((s) => s.grup === 1).map((s) => s.model);
          const ortak = ceyrek(tablo.map((s) => s.Bias), 0.5);
          return (
            <>
              <details className="ak-nasil dg-nasil">
                <summary>Bu sıralama nasıl okunur?</summary>
                <p className="an-not">Tahmin, geçerlilik zamanından 1, 2 ya da 3 gün önce yayımlanmış koşudan alınır. Ufuklar ayrı ayrı sıralanır; bir modelin kısa vadede iyi olması uzun vadede de iyi olduğu anlamına gelmez.</p>
                <p className="an-not">{kalin(`Sıcaklık · **${istasyon.ad}** (${istasyon.icao}) istasyonu, konumuna ${sayi(istasyon.km)} km · ${bilgi.gun} gün, bütün modeller için aynı ${bilgi.N} saat. Bu sıralama istasyonun bulunduğu nokta içindir; ${yer} için aynısı geçerli olmayabilir: kıyı, vadi ve rakım farkı modelleri farklı etkiler.`)}</p>
              </details>
              {bilgi.gun < 20 && <Not tur="dikkat">Yalnızca {bilgi.gun} günlük ölçüm var; bu kadar kısa bir dönemde sıralama güvenilir değildir.</Not>}
              <section className="ak" aria-label="Modellerin ortalama mutlak hatası ve güven aralığı">
                <SiraTablosu tablo={tablo} />
              </section>
              <div className="uy bilgi sy-not">
                <p>{enIyi.length === 1
                  ? kalin(`**${enIyi[0]}** bu dönemde diğer bütün modellerden anlamlı ölçüde isabetli.`)
                  : kalin(`**${enIyi.slice(0, -1).join(", ")} ve ${enIyi[enIyi.length - 1]}** birbirinden ayırt edilemiyor: aralarındaki fark, seçilen günlere bağlı bir rastlantı olabilir. Bu veriyle birini “birinci” ilan etmek savunulamaz.`)}</p>
                {Math.abs(ortak) >= 0.3 && <p className="an-kucuk">{kalin(`Modellerin çoğu bu istasyonu **${sayi(Math.abs(ortak), 1)} °C ${ortak > 0 ? "sıcak" : "soğuk"}** tahmin ediyor. Hepsinde aynı yönde görülen sapma genellikle modellerden değil, istasyonun konumundan gelir (temsil hatası): kıyıdaki ya da vadideki bir termometre, modelin ızgara karesinin ortalamasından sistematik olarak farklıdır.`)}</p>}
                {bilgi.disarida.length > 0 && <p className="an-kucuk">Arşivde bu dönem için yeterli tahmini olmadığı için sıralamaya alınmadı: {bilgi.disarida.map((m) => MODELLER[m] ?? m).join(", ")}.</p>}
              </div>
            </>
          );
        }}
      </Durum>
    </>
  );
}

/** Sıralama tablosu: her modelin ortalama mutlak hatası (nokta) ve %90 güven aralığı (çizgi) aynı ölçekte; renk,
 * birbirinden ayırt edilemeyen grupları gösterir. */
function SiraTablosu({ tablo }: { tablo: readonly SiraSatiri[] }) {
  const koyu = useKoyuTema();
  const e = eksen([...tablo.map((s) => s.alt), ...tablo.map((s) => s.ust)], { hedef: 4 });
  const yuzde = (v: number) => `${((v - e.alt) / (e.ust - e.alt)) * 100}%`;
  return (
    <div className="sy-tablo sira">
      <table>
        <thead>
          <tr><th scope="col">Grup</th><th scope="col">Model</th><th scope="col">MAE (°C)</th>
            <th scope="col" className="sira-olcek">Ortalama mutlak hata ve %90 aralığı
              <span aria-hidden="true">{e.cizgiler.map((v) => <i key={v} style={{ left: yuzde(v) }}>{sayi(v, e.adim < 1 ? 1 : 0)}</i>)}</span></th>
            <th scope="col">%90 aralığı</th><th scope="col">RMSE</th><th scope="col">Sapma</th><th scope="col">N (saat)</th></tr>
        </thead>
        <tbody>
          {tablo.map((s) => {
            const renk = ekranRengi(GRUP_RENK[Math.min(s.grup, GRUP_RENK.length) - 1]!, koyu);
            return (
              <tr key={s.kod}>
                <td><span className="sira-grup" style={{ background: renk }}>{s.grup}</span></td>
                <th scope="row">{s.model}</th>
                <td>{sayi(s.MAE, 2)}</td>
                <td className="sira-iz" aria-hidden="true"><div>
                  <i style={{ left: yuzde(s.alt), width: `calc(${yuzde(s.ust)} - ${yuzde(s.alt)})`, background: renk }} />
                  <b style={{ left: yuzde(s.MAE), background: renk }} />
                </div></td>
                <td>{sayi(s.alt, 2)}–{sayi(s.ust, 2)}</td><td>{sayi(s.RMSE, 2)}</td><td>{isaretli(s.Bias, 2)}</td><td>{s.N}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="ak-ac">Aynı gruptaki (aynı renkteki) modeller birbirinden ayırt edilemez. 1. grup en iyi modelden ayırt edilemeyenlerdir.</p>
    </div>
  );
}

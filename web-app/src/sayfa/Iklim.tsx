/** İklim ve geçmiş: bugünkü hava ve tahmin, bu yerin 1991–2020 normaliyle ve 1991'den bu yana her yılla
 * karşılaştırılır. Streamlit'teki `app_pages/iklim.py` sayfasının karşılığı; hesaplar `hesap/iklim.ts` içinde. */
import { useMemo } from "react";
import { Cizelge, IpucuBasligi, IpucuSatiri, type Panel } from "../grafik/Cizelge";
import { sapmaRengi } from "../grafik/olcek";
import { arsiv, ayniGunGecmisi, aylikYagis, dogrusalEgilim, type GunlukIklim, normalAl, normaller, sonGunler, yillik } from "../hesap/iklim";
import { ilkEnBuyuk, ilkEnKucuk, ortalama, topla } from "../ortak/dizi";
import { yerelSaat } from "../ortak/zaman";
import { Bolum, BolumCubugu, Durum, isaretli, kalin, Not, Olcut, Rehber, type SayfaOzellik, SayfaBasligi, sayi, useVeri } from "./ortak";

const AYLAR = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const AY_TAM = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const KIRMIZI = "#B5352B", MAVI = "#2A6FB0", GRI = "#6F7F76", TURUNCU = "#B2602A", MUREKKEP = "#1C2829";
const SOGUK = "#1F5FA8", SICAK = "#B5352B";
const gunAy = (g: string) => `${g.slice(8, 10)}.${g.slice(5, 7)}`;

export function Iklim({ istemci, konum, tahmin }: SayfaOzellik) {
  const tz = tahmin.tz;
  const d = useVeri(async () => {
    const [a, son] = await Promise.all([arsiv(istemci, konum), sonGunler(istemci, { ...konum, tz })]);
    return { a, son };
  }, [istemci, konum.lat, konum.lon, tz]);
  return (
    <div className="sy">
      <SayfaBasligi baslik="İklim ve geçmiş" yer={konum.ad}>
        Bugünkü hava ve tahmin, bu yerin 1991–2020 mevsim normaliyle ve 1991'den bu yana her yılla karşılaştırılır.
        “Sıcak” ya da “yağışlı” ancak normale göre söylenebilir.
      </SayfaBasligi>
      <BolumCubugu />
      <Durum d={d} bekleme="35 yıllık geçmiş veri indiriliyor… (ilk açılışta birkaç saniye sürer, sonra bu ay boyunca tarayıcıda saklanır)">
        {({ a, son }) => (a && a.gun.length
          ? <Icerik a={a} son={son} bugun={yerelSaat(new Date(), tz).slice(0, 10)} />
          : <p className="an-not an-hata" role="alert">Geçmiş veri alınamadı. Biraz sonra tekrar dene.</p>)}
      </Durum>
    </div>
  );
}

function Icerik({ a, son, bugun }: { a: GunlukIklim; son: GunlukIklim | null; bugun: string }) {
  const h = useMemo(() => {
    const nrm = normaller(a), bn = normalAl(nrm, [bugun])[0]!;
    const yili = Number(bugun.slice(0, 4)), ayi = Number(bugun.slice(5, 7)), gunu = Number(bugun.slice(8, 10));
    const bugunSira = son ? son.gun.indexOf(bugun) : -1;
    const bugunMax = bugunSira >= 0 ? son!.max[bugunSira] ?? null : null;

    const g = ayniGunGecmisi(a, bugun).filter((x) => x.max != null);
    const rekorSicak = g[ilkEnBuyuk(g.map((x) => x.max))], rekorSoguk = g[ilkEnKucuk(g.map((x) => x.min))];
    const y = yillik(a);
    const ay = aylikYagis(a, son, yili, bugun);
    const gecen = ay.ay.map((m, i) => ({ m, n: ay.normal[i] ?? null, b: ay.bu_yil[i] ?? null })).filter((x) => x.m <= ayi - 1);
    const normalToplam = topla(gecen.map((x) => x.n)), oran = normalToplam ? (topla(gecen.map((x) => x.b)) / normalToplam) * 100 : null;

    // son günler + tahmin, normal bandıyla (en yüksek sıcaklığı olan günler)
    const sira = son ? son.gun.map((_, i) => i).filter((i) => son.max[i] != null) : [];
    const gunler = sira.map((i) => son!.gun[i]!), ni = normalAl(nrm, gunler);
    const deger = sira.map((i) => son!.max[i]!);
    const normal = ni.map((i) => nrm.max_ort[i] ?? null), p10 = ni.map((i) => nrm.max_p10[i] ?? null), p90 = ni.map((i) => nrm.max_p90[i] ?? null);
    const gelecek = gunler.map((gn, i) => (gn > bugun && normal[i] != null ? deger[i]! - normal[i]! : null)).filter((x): x is number => x != null);
    const sapma = gelecek.length ? ortalama(gelecek) : null;

    return { nrm, bn, yili, ayi, gunu, bugunMax, g, rekorSicak, rekorSoguk, y, ay, oran, gunler, deger, normal, p10, p90, sapma, gelecekGun: gelecek.length };
  }, [a, son, bugun]);
  const { nrm, bn, y } = h;
  const tarihAdi = `${h.gunu} ${AY_TAM[h.ayi - 1]}`;

  return (
    <>
      <dl className="olcutler">
        {h.bugunMax != null && nrm.max_ort[bn] != null
          ? <Olcut baslik="Bugün en yüksek" deger={`${sayi(h.bugunMax)}°`} ek={`${isaretli(h.bugunMax - nrm.max_ort[bn]!)}° normale göre`}
                   aciklama={`Bugünün normali ${sayi(nrm.max_ort[bn], 1)}° (en yüksek), ${sayi(nrm.min_ort[bn], 1)}° (en düşük). Yılların %80'inde en yüksek sıcaklık ${sayi(nrm.max_p10[bn])}° ile ${sayi(nrm.max_p90[bn])}° arasında.`} />
          : <Olcut baslik="Bugünün normali" deger={`${sayi(nrm.max_ort[bn])}° / ${sayi(nrm.min_ort[bn])}°`} />}
        {h.rekorSicak && h.rekorSoguk && (
          <Olcut baslik={`${tarihAdi} rekorları`} deger={`${sayi(h.rekorSicak.max)}° / ${sayi(h.rekorSoguk.min)}°`} ek={`${h.rekorSicak.yil} sıcak · ${h.rekorSoguk.yil} soğuk`}
                 aciklama="1991'den bu yana bu tarihin (±3 gün ortalaması) en sıcak ve en soğuk yılları." />
        )}
        <Olcut baslik="Isınma eğilimi" deger={`${isaretli(y.egim, 2)} °C`} ek="her 10 yılda"
               aciklama={`${y.yil[0]}–${y.yil[y.yil.length - 1]} yıllık ortalamalarına doğrusal eğilim. Küresel ortalama yaklaşık +0,2 °C/10 yıldır; karalar ve Akdeniz havzası daha hızlı ısınıyor.`} />
        <Olcut baslik={`${h.yili} yağışı`} deger={h.oran == null ? "—" : `%${sayi(h.oran)}`} ek={`normalin (Ocak–${h.ayi > 1 ? AY_TAM[h.ayi - 2] : "Ocak"})`}
               aciklama="Tamamlanmış ayların yağış toplamının aynı ayların 1991–2020 normaline oranı. %100 altı kurak." />
      </dl>

      <Bolum baslik="Son günler ve önümüzdeki 10 gün, normale göre" kisa="Normale göre" />
      {h.gunler.length > 1 ? (
        <>
          <section className="ak" aria-label="En yüksek sıcaklığın normal bandıyla karşılaştırması">
            <p className="ak-ac">Gri bant yılların %80'inin kaldığı aralık, kesikli çizgi ortalama normaldir. Bandın dışına çıkan günler “mevsim normallerinin üstünde/altında” sayılır. Mavi çizgi bugün.</p>
            <NormalBandi h={h} bugun={bugun} />
          </section>
          {h.sapma != null && Math.abs(h.sapma) >= 1 && (
            <Not>{kalin(`Önümüzdeki ${h.gelecekGun} gün, mevsim normalinden ortalama **${isaretli(h.sapma)} °C** ${h.sapma > 0 ? "sıcak" : "soğuk"} görünüyor.`)}</Not>
          )}
        </>
      ) : <Not tur="dikkat">Son günlerin verisi şu an alınamadı.</Not>}

      <div className="sy-iki">
        <div>
          <Bolum baslik={`${tarihAdi} geçmiş yıllarda`} kisa="Bugün geçmişte" />
          <section className="ak" aria-label="Her yıl bugünün tarihindeki en yüksek sıcaklık">
            <AyniGun g={h.g} buYil={h.bugunMax} tarih={`${h.gunu} ${AYLAR[h.ayi - 1]}`} />
          </section>
        </div>
        <div>
          <Bolum baslik="Isınma şeritleri" kisa="Isınma" />
          <section className="ak" aria-label="Yıllık ortalama sıcaklığın normalden farkı">
            <p className="ak-ac">Her şerit bir yıl: mavi normalden ({sayi(y.normal, 1)} °C) soğuk, kırmızı sıcak. Klimatolog Ed Hawkins'in “warming stripes” görselinin bu konum için hesaplanmış hâli. Kaynak: ERA5 yeniden analizi.</p>
            <Seritler y={y} />
            <p className="ak-ac"><strong>En sıcak yıllar:</strong> {y.yil.map((yl, i) => ({ yl, o: y.ort[i]!, s: y.sapma[i]! })).sort((p, q) => q.o - p.o).slice(0, 3).map((x) => `${x.yl} (${isaretli(x.s)}°)`).join(", ")}</p>
          </section>
        </div>
      </div>

      <Bolum baslik={`${h.yili} yağışı, aylara göre`} kisa="Yağış" />
      <section className="ak" aria-label="Bu yılın aylık yağışı ve normali">
        <AylikYagis ay={h.ay} />
      </section>

      <Rehber baslik="Bu sayfa nasıl okunur?" adimlar={[
        ["Mevsim normali nedir?", "Dünya Meteoroloji Örgütü'nün tanımıyla 30 yıllık ortalamadır; güncel standart dönem 1991–2020. “Normal” tek bir sayı değil bir aralıktır: o tarihte yılların çoğunun düştüğü bant."],
        ["Veri nereden geliyor?", "ERA5, Avrupa Orta Vadeli Hava Tahminleri Merkezi'nin (ECMWF) geçmişteki tüm gözlemleri aynı modelle birleştirerek ürettiği “yeniden analiz”dir: yaklaşık 25 km'lik ızgarada, 1940'tan bugüne kesintisiz. İstasyon ölçümü değildir; dağlık ve kıyı yerlerde termometreden birkaç derece farklı olabilir, ama yıllar arası karşılaştırma için tutarlıdır."],
        ["Anomali", "Normalden fark. Meteorologlar “sıcak hafta” yerine “+4 °C anomali” der; çünkü 25 °C temmuzda serin, kasımda olağanüstü sıcaktır."],
        ["Rekorlar ve eğilim", "Rekorların büyük kısmının son yıllarda gelmesi ve şeritlerin sağa doğru kızarması, ısınmanın yerel ölçekteki izidir. Yine de tek bir sıcak gün iklim değişikliğinin kanıtı değildir; kanıt uzun dönem eğilimdir."],
      ]} />
    </>
  );
}

function NormalBandi({ h, bugun }: { h: { gunler: string[]; deger: number[]; normal: (number | null)[]; p10: (number | null)[]; p90: (number | null)[] }; bugun: string }) {
  const c = useMemo(() => {
    const { gunler, deger, normal, p10, p90 } = h;
    const paneller: Panel[] = [{ baslik: "En yüksek sıcaklık (°C)", boy: 250, hedef: 5, isaret: [gunler.indexOf(bugun)], seriler: [
      { tur: "bant", ad: "Normal aralık (%10–%90)", alt: p10, ust: p90, renk: GRI },
      { tur: "cizgi", ad: "Normal", deger: normal, renk: GRI, kalinlik: 1.6, desen: "kesik", duz: true, sessiz: true },
      { tur: "cizgi", ad: "Gerçekleşen", deger: deger.map((v, i) => (gunler[i]! <= bugun ? v : null)), renk: KIRMIZI, kalinlik: 2.5, duz: true },
      { tur: "cizgi", ad: "Tahmin", deger: deger.map((v, i) => (gunler[i]! >= bugun ? v : null)), renk: KIRMIZI, kalinlik: 2.5, desen: "kesik", duz: true },
    ] }];
    const fark = (i: number) => (normal[i] == null ? null : deger[i]! - normal[i]!);
    return {
      paneller,
      xEtiket: (i: number) => gunAy(gunler[i]!),
      ipucu: (i: number) => (
        <>
          <IpucuBasligi>{gunAy(gunler[i]!)}.{gunler[i]!.slice(0, 4)} · {gunler[i]! > bugun ? "tahmin" : "gerçekleşen"}</IpucuBasligi>
          <IpucuSatiri renk={KIRMIZI} desen={gunler[i]! > bugun ? "kesik" : "duz"} ad="En yüksek" deger={`${sayi(deger[i], 1)} °C`} />
          <IpucuSatiri renk={GRI} desen="kesik" ad="Normali" deger={`${sayi(normal[i], 1)} °C`} />
          <IpucuSatiri ad="Normalden fark" deger={`${isaretli(fark(i))} °C`} />
          <IpucuSatiri ad="Normal aralık" deger={`${sayi(p10[i], 1)} – ${sayi(p90[i], 1)} °C`} />
        </>
      ),
      tablo: { basliklar: ["Gün", "Tür", "En yüksek °C", "Normali °C", "Fark °C", "%10", "%90"],
               satir: (i: number) => [`${gunAy(gunler[i]!)}.${gunler[i]!.slice(0, 4)}`, gunler[i]! > bugun ? "tahmin" : "gerçekleşen", sayi(deger[i], 1), sayi(normal[i], 1), isaretli(fark(i)), sayi(p10[i], 1), sayi(p90[i], 1)] },
    };
  }, [h, bugun]);
  return <Cizelge n={h.gunler.length} paneller={c.paneller} xEtiket={c.xEtiket} ipucu={c.ipucu} tablo={c.tablo} etiket="Son günler ve tahmin, normal bandıyla" />;
}

function AyniGun({ g, buYil, tarih }: { g: { yil: number; max: number | null; min: number | null }[]; buYil: number | null; tarih: string }) {
  const c = useMemo(() => {
    const yillar = g.map((x) => x.yil), max = g.map((x) => x.max), ort = ortalama(max);
    const e = dogrusalEgilim(yillar, max);
    const sinir = Math.max(1, ...max.map((v) => Math.abs((v ?? ort) - ort)));
    const rekor = ilkEnBuyuk(max), ek = buYil != null ? 1 : 0, n = g.length + ek, bos = ek ? [null] : [];
    const paneller: Panel[] = [{ baslik: `${tarih} en yüksek (°C)`, boy: 220, ustBosluk: 20, seriler: [
      { tur: "cubuk", deger: [...max, ...bos], renk: GRI, renkler: max.map((v) => (v == null ? null : sapmaRengi(v - ort, sinir, SOGUK, "#C9D2C4", SICAK))),
        etiket: (_, i) => (i === rekor ? "rekor" : null) },
      ...(e ? [{ tur: "cizgi" as const, ad: "Eğilim", deger: [...yillar.map((yl) => e.kesim + e.egim * yl), ...bos], renk: MUREKKEP, kalinlik: 1.5, desen: "kesik" as const, duz: true, sessiz: true }] : []),
      ...(ek ? [{ tur: "nokta" as const, ad: "Bu yıl (bugün)", deger: [...max.map(() => null), buYil], renk: TURUNCU, sekil: "elmas" as const }] : []),
    ] }];
    return {
      n, paneller, egim: e ? e.egim * 10 : null,
      xEtiket: (i: number) => (i < g.length && yillar[i]! % 5 === 0 ? String(yillar[i]) : null),
      ipucu: (i: number) => (i < g.length
        ? <><IpucuBasligi>{yillar[i]}</IpucuBasligi><IpucuSatiri ad="En yüksek" deger={`${sayi(max[i], 1)} °C`} /><IpucuSatiri ad="En düşük" deger={`${sayi(g[i]!.min, 1)} °C`} /><IpucuSatiri ad="Ortalamadan fark" deger={`${isaretli((max[i] ?? ort) - ort)} °C`} /></>
        : <><IpucuBasligi>Bu yıl</IpucuBasligi><IpucuSatiri renk={TURUNCU} ad="Bugün en yüksek" deger={`${sayi(buYil, 1)} °C`} /></>),
      tablo: { basliklar: ["Yıl", "En yüksek °C", "En düşük °C"],
               satir: (i: number) => (i < g.length ? [String(yillar[i]), sayi(max[i], 1), sayi(g[i]!.min, 1)] : ["Bu yıl", sayi(buYil, 1), "—"]) },
    };
  }, [g, buYil, tarih]);
  return (
    <>
      <p className="ak-ac">{c.egim != null && kalin(`Kesikli çizgi eğilimdir: bu tarihte en yüksek sıcaklık on yılda **${isaretli(c.egim)} °C** değişmiş. `)}
        Çubuğun rengi o yılın ortalamadan farkını gösterir (mavi serin, kırmızı sıcak){buYil != null && "; turuncu elmas bu yılın değeri"}. Tek bir günün eğilimi gürültülüdür; asıl ısınma sinyali yıllık ortalamada görülür.</p>
      <Cizelge n={c.n} bant paneller={c.paneller} xEtiket={c.xEtiket} ipucu={c.ipucu} tablo={c.tablo} etiket="Aynı takvim gününün yıllara göre en yüksek sıcaklığı" />
    </>
  );
}

function Seritler({ y }: { y: { yil: number[]; ort: number[]; sapma: number[] } }) {
  const c = useMemo(() => {
    const sinir = Math.max(1, ...y.sapma.map(Math.abs));
    const paneller: Panel[] = [{ boy: 96, eksensiz: true, seriler: [{ tur: "serit", renkler: y.sapma.map((s) => sapmaRengi(s, sinir, "#08519C", "#F2F4EF", "#A50F15")) }] }];
    return {
      paneller,
      xEtiket: (i: number) => (i === 0 || i === y.yil.length - 1 || y.yil[i]! % 10 === 0 ? String(y.yil[i]) : null),
      ipucu: (i: number) => <><IpucuBasligi>{y.yil[i]}</IpucuBasligi><IpucuSatiri ad="Yıllık ortalama" deger={`${sayi(y.ort[i], 2)} °C`} /><IpucuSatiri ad="Normalden fark" deger={`${isaretli(y.sapma[i], 2)} °C`} /></>,
      tablo: { basliklar: ["Yıl", "Ortalama °C", "Normalden fark °C"], satir: (i: number) => [String(y.yil[i]), sayi(y.ort[i], 2), isaretli(y.sapma[i], 2)] },
    };
  }, [y]);
  return <Cizelge n={y.yil.length} bant paneller={c.paneller} xEtiket={c.xEtiket} ipucu={c.ipucu} tablo={c.tablo} etiket="Isınma şeritleri" />;
}

function AylikYagis({ ay }: { ay: { ay: number[]; normal: (number | null)[]; bu_yil: (number | null)[] } }) {
  const c = useMemo(() => {
    const paneller: Panel[] = [{ baslik: "Aylık yağış (mm)", boy: 210, taban: 0, seriler: [
      { tur: "cubuk", ad: "Normal (1991–2020)", deger: ay.normal, renk: GRI, grup: [0, 2] },
      { tur: "cubuk", ad: "Bu yıl", deger: ay.bu_yil, renk: MAVI, grup: [1, 2] },
    ] }];
    return {
      paneller,
      xEtiket: (i: number) => AYLAR[ay.ay[i]! - 1] ?? null,
      ipucu: (i: number) => <><IpucuBasligi>{AY_TAM[ay.ay[i]! - 1]}</IpucuBasligi><IpucuSatiri renk={MAVI} ad="Bu yıl" deger={`${sayi(ay.bu_yil[i])} mm`} /><IpucuSatiri renk={GRI} ad="Normal" deger={`${sayi(ay.normal[i])} mm`} /></>,
      tablo: { basliklar: ["Ay", "Bu yıl mm", "Normal mm"], satir: (i: number) => [AY_TAM[ay.ay[i]! - 1]!, sayi(ay.bu_yil[i]), sayi(ay.normal[i])] },
    };
  }, [ay]);
  return <Cizelge n={ay.ay.length} bant paneller={c.paneller} xEtiket={c.xEtiket} ipucu={c.ipucu} tablo={c.tablo} etiket="Bu yılın aylık yağışı ve normali" />;
}

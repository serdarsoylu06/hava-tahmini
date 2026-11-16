/** Uzman modun analiz paneli: seçili konum için meteogram, modellerin karşılaştırması ve ansambl. */
import { type ReactNode, useMemo, useState } from "react";
import { Cizelge, IpucuBasligi, IpucuSatiri, type Panel, type Seri } from "../grafik/Cizelge";
import { Serit } from "../kabuk/Serit";
import { GUNLER, haftaGunu } from "../ortak/zaman";
import { Durum, kalin, useVeri } from "../sayfa/ortak";
import type { Istemci } from "../veri/istemci";
import { ansambl, simdiden, simdikiSaat } from "../veri/openMeteo";
import type { Deger, Konum, Tablo, Tahmin } from "../veri/tipler";
import * as hesap from "./analiz";
import { MODELLER, type ModelKodu } from "./katmanlar";

/** Analiz panelinin alttan açılan sayfa olduğu genişlik (stil.css ile aynı eşik). */
const DAR_EKRAN = typeof matchMedia === "function" && matchMedia("(max-width: 1100px)").matches;

/** Grafiğin açıklaması. Dar ekranda kapalı gelir (grafik panel açılır açılmaz görünsün), geniş ekranda açık. */
function NasilOkunur({ children }: { children: ReactNode }) {
  return <details className="ak-nasil" open={!DAR_EKRAN}><summary>Bu grafik nasıl okunur?</summary><p className="ak-ac">{children}</p></details>;
}


const YESIL = "#2E6B3A", MAVI = "#2A6FB0", TURUNCU = "#B2602A", MUREKKEP = "#1C2829";

const saatYaz = (z: string) => `${GUNLER[haftaGunu(z)]} ${z.slice(8, 10)}.${z.slice(5, 7)} ${z.slice(11, 16)}`;
const sayi = (x: Deger | undefined, n = 0) => (x == null ? "—" : x.toFixed(n).replace(".", ","));

const gunYaz = (g: string) => `${GUNLER[haftaGunu(g)]} ${g.slice(8, 10)}.${g.slice(5, 7)}`;
const gunBasi = (zaman: readonly string[]) => (i: number) => zaman[i]!.endsWith("T00:00");
/** Zaman ekseni yazısı: gün başlarında gün adı ve tarih, öğlenlerde "12". */
const zamanYazisi = (zaman: readonly string[]) => (i: number) => {
  const z = zaman[i]!;
  return z.endsWith("T00:00") ? gunYaz(z) : z.endsWith("T12:00") ? "12" : null;
};

// ------------------------------------------------------------------ meteogram
function Meteogram({ istemci, konum, tahmin, model, gun }: { istemci: Istemci; konum: Konum; tahmin: Tahmin; model: ModelKodu; gun: number }) {
  const m = MODELLER[model];
  const ortak = useMemo(() => hesap.ilkSaatler(simdiden(tahmin.saatlik, simdikiSaat(tahmin.tz)), gun * 24), [tahmin, gun]);
  const d = useVeri(async () => hesap.modelleBirlestir(ortak, await hesap.modelTahmini(istemci, konum, m.api), m.api), [istemci, konum.lat, konum.lon, m.api, ortak]);
  return (
    <Durum d={d} iskelet="panel">
      {(t) => {
        const o = hesap.meteogramOzeti(t);
        return (
          <>
            <dl className="an-ozet an-serit">
              <div><dt><span>En yüksek / en düşük</span><i>Sıcaklık</i></dt><dd>{o.enYuksek}/{o.enDusuk}</dd></div>
              <div><dt><span>Toplam yağış</span><i>Yağış</i></dt><dd>{o.toplamYagis.replace(".", ",")}</dd></div>
              <div><dt><span>Toplam kar</span><i>Kar</i></dt><dd>{o.toplamKar.replace(".", ",")}</dd></div>
              <div><dt><span>En kuvvetli hamle</span><i>Hamle</i></dt><dd>{o.enKuvvetliHamle}</dd></div>
              <div><dt><span>Basınç değişimi</span><i>Basınç</i></dt><dd>{o.basincDegisimi}</dd></div>
            </dl>
            <section className="ak" aria-label={`${m.ad} meteogramı`}>
              {/* dar ekranda kapalı gelir: grafik panel açılır açılmaz görünsün */}
              <details className="ak-nasil" open={!DAR_EKRAN}>
                <summary>Bu grafikler nasıl okunur?</summary>
                <p className="ak-ac">{m.ad} modelinin {konum.ad} için tahmini. Modelin vermediği değişkenler (ör. yağış olasılığı) ortak tahminden alınır. Bir saatin üzerine gel ya da dokun: bütün paneller aynı saati gösterir.</p>
              </details>
              <MeteogramGrafigi t={t} />
            </section>
          </>
        );
      }}
    </Durum>
  );
}

function MeteogramGrafigi({ t }: { t: Tablo }) {
  const c = useMemo(() => {
    const s = (ad: string) => t.sutun[ad] ?? t.zaman.map(() => null);
    const sicak = s("temperature_2m"), ciy = s("dew_point_2m"), his = s("apparent_temperature"), yagis = s("precipitation"),
          olasilik = s("precipitation_probability"), ruzgar = s("wind_speed_10m"), hamle = s("wind_gusts_10m"), basinc = s("pressure_msl");
    // Yağış miktarı ile olasılığı ayrı panellerde: ikisinin ölçeği farklı, aynı panelde biri ötekinin eksenini okutmaz.
    const paneller: Panel[] = [
      { baslik: "Sıcaklık (°C)", boy: 120, seriler: [
        { tur: "cizgi", ad: "Sıcaklık", deger: sicak, renk: YESIL, kalinlik: 2.4 },
        { tur: "cizgi", ad: "Çiy noktası", deger: ciy, renk: MAVI, kalinlik: 1.6, desen: "kesik" },
        { tur: "cizgi", ad: "Hissedilen", deger: his, renk: TURUNCU, kalinlik: 1.8, desen: "nokta" }] },
      { baslik: "Yağış (mm)", boy: 64, taban: 0, seriler: [{ tur: "cubuk", deger: yagis, renk: MAVI }] },
      { baslik: "Yağış olasılığı (%)", boy: 52, taban: 0, tavan: 100, cizgiler: [0, 50, 100],
        seriler: [{ tur: "cizgi", deger: olasilik, renk: MAVI, kalinlik: 1.6, dolgu: true, duz: true }] },
      { baslik: "Rüzgâr (km/s)", boy: 90, taban: 0, seriler: [
        { tur: "cizgi", ad: "Rüzgâr", deger: ruzgar, renk: YESIL, dolgu: true },
        { tur: "cizgi", ad: "Hamle", deger: hamle, renk: MAVI, kalinlik: 1.6, desen: "kesik" }] },
      { baslik: "Basınç (hPa)", boy: 80, seriler: [{ tur: "cizgi", deger: basinc, renk: YESIL }] },
    ];
    return {
      paneller,
      ipucu: (i: number) => (
        <>
          <IpucuBasligi>{saatYaz(t.zaman[i]!)}</IpucuBasligi>
          <IpucuSatiri renk={YESIL} ad="Sıcaklık" deger={`${sayi(sicak[i], 1)}°`} />
          <IpucuSatiri renk={MAVI} desen="kesik" ad="Çiy noktası" deger={`${sayi(ciy[i], 1)}°`} />
          <IpucuSatiri renk={TURUNCU} desen="nokta" ad="Hissedilen" deger={`${sayi(his[i], 1)}°`} />
          <IpucuSatiri renk={MAVI} ad="Yağış" deger={`${sayi(yagis[i], 1)} mm`} />
          <IpucuSatiri ad="Yağış olasılığı" deger={`%${sayi(olasilik[i])}`} />
          <IpucuSatiri renk={YESIL} ad="Rüzgâr" deger={`${sayi(ruzgar[i])} km/s`} />
          <IpucuSatiri renk={MAVI} desen="kesik" ad="Hamle" deger={`${sayi(hamle[i])} km/s`} />
          <IpucuSatiri renk={YESIL} ad="Basınç" deger={`${sayi(basinc[i])} hPa`} />
        </>
      ),
      tablo: { basliklar: ["Zaman", "Sıcaklık °C", "Çiy °C", "Hissedilen °C", "Yağış mm", "Olasılık %", "Rüzgâr km/s", "Hamle km/s", "Basınç hPa"],
               satir: (i: number) => [saatYaz(t.zaman[i]!), sayi(sicak[i], 1), sayi(ciy[i], 1), sayi(his[i], 1), sayi(yagis[i], 1), sayi(olasilik[i]), sayi(ruzgar[i]), sayi(hamle[i]), sayi(basinc[i])] },
      xEtiket: zamanYazisi(t.zaman), dikey: gunBasi(t.zaman),
    };
  }, [t]);
  return <Cizelge n={t.zaman.length} bant paneller={c.paneller} xEtiket={c.xEtiket} dikey={c.dikey} ipucu={c.ipucu} tablo={c.tablo}
                  etiket="Meteogram: sıcaklık, yağış, rüzgâr ve basınç" />;
}

// ------------------------------------------------------------------ modeller
function Modeller({ istemci, konum, gun }: { istemci: Istemci; konum: Konum; gun: number }) {
  const [ad, setAd] = useState("Sıcaklık");
  const tanim = hesap.KARSILASTIRMA_DEGISKENLERI[ad]!;
  const d = useVeri(() => hesap.modelKarsilastirmasi(istemci, konum, tanim.degisken, gun), [istemci, konum.lat, konum.lon, tanim.degisken, gun]);
  return (
    <>
      <Serit etiket="Değişken" className="an-degisken" secili={ad}>
        {Object.keys(hesap.KARSILASTIRMA_DEGISKENLERI).map((k) => <button key={k} type="button" className="cip" aria-pressed={k === ad} onClick={() => setAd(k)}>{k}</button>)}
      </Serit>
      <Durum d={d} iskelet="panel">
        {(t) => {
          const seriler = hesap.modelSerileri(t, tanim.degisken);
          const uyum = hesap.modelUyumu(t.zaman, seriler, tanim.birim, tanim.esik);
          if (!seriler.length) return <p className="an-not">Bu konum için model verisi yok.</p>;
          return (
            <>
              <section className="ak" aria-label="Modellerin karşılaştırması">
                <NasilOkunur>Dünyanın önde gelen tahmin merkezlerinin modelleri aynı yer için yan yana. Çizgisi erken biten model o saatten sonrasını tahmin etmiyordur.</NasilOkunur>
                <ModelGrafigi t={t} seriler={seriler} birim={tanim.birim} baslik={ad} />
              </section>
              <div className={`uy ${uyum.durum === "uyumlu" ? "iyi" : uyum.durum === "bozuluyor" ? "dikkat" : "bilgi"} an-uyum`}>
                <h3>{uyum.durum === "uyumlu" ? "Modeller uyumlu" : uyum.durum === "bozuluyor" ? "Uyum bozuluyor" : "Yeterli model yok"}</h3>
                <p>{kalin(uyum.metin)}</p>
                <p className="an-kucuk">Fark tek başına “hangisi doğru”yu söylemez; tahminin ne kadar emin olduğunu söyler.</p>
              </div>
            </>
          );
        }}
      </Durum>
    </>
  );
}

function ModelGrafigi({ t, seriler, birim, baslik }: { t: Tablo; seriler: hesap.ModelSerisi[]; birim: string; baslik: string }) {
  const c = useMemo(() => {
    const kisa = (ad: string) => ad.split(" (")[0]!;
    const paneller: Panel[] = [{ baslik: `${baslik} (${birim})`, boy: 230,
      seriler: seriler.map((s): Seri => ({ tur: "cizgi", ad: s.ad, deger: s.deger, renk: s.renk, kalinlik: 1.8, duz: true })) }];
    return {
      paneller,
      ipucu: (i: number) => (
        <>
          <IpucuBasligi>{saatYaz(t.zaman[i]!)}</IpucuBasligi>
          {seriler.map((s) => <IpucuSatiri key={s.ad} renk={s.renk} ad={kisa(s.ad)} deger={`${sayi(s.deger[i], 1)} ${birim}`} />)}
        </>
      ),
      tablo: { basliklar: ["Zaman", ...seriler.map((s) => kisa(s.ad))], satir: (i: number) => [saatYaz(t.zaman[i]!), ...seriler.map((s) => sayi(s.deger[i], 1))] },
      xEtiket: zamanYazisi(t.zaman), dikey: gunBasi(t.zaman),
    };
  }, [t, seriler, birim, baslik]);
  return <Cizelge n={t.zaman.length} paneller={c.paneller} xEtiket={c.xEtiket} dikey={c.dikey} ipucu={c.ipucu} tablo={c.tablo}
                  etiket={`Modellerin ${baslik.toLocaleLowerCase("tr")} tahmini`} />;
}

// ------------------------------------------------------------------ ansambl
function Ansambl({ istemci, konum, gun }: { istemci: Istemci; konum: Konum; gun: number }) {
  const [modelAd, setModelAd] = useState(Object.keys(hesap.ANSAMBL_MODELLERI)[0]!);
  const [ad, setAd] = useState("Sıcaklık");
  const [esik, setEsik] = useState(1);
  const tanim = hesap.ANSAMBL_DEGISKENLERI[ad]!;
  const d = useVeri(() => ansambl(istemci, konum, hesap.ANSAMBL_MODELLERI[modelAd]!, tanim.degisken, gun).then((x) => x.tablo),
                    [istemci, konum.lat, konum.lon, modelAd, tanim.degisken, gun]);
  return (
    <>
      <div className="an-satir">
        <div className="an-cipler" role="group" aria-label="Değişken">
          {Object.keys(hesap.ANSAMBL_DEGISKENLERI).map((k) => <button key={k} type="button" className="cip" aria-pressed={k === ad} onClick={() => setAd(k)}>{k}</button>)}
        </div>
        {/* görünen kısa ad süs; seçimi üstüne yayılmış görünmez <select> yapar (yerel menü, klavye ve ekran okuyucu aynen çalışır) */}
        <label className="an-model">
          <span className="gizli">Ansambl modeli</span>
          <span aria-hidden="true">{hesap.kisaModelAdi(modelAd)}</span>
          <select value={modelAd} onChange={(e) => setModelAd(e.target.value)}>{Object.keys(hesap.ANSAMBL_MODELLERI).map((k) => <option key={k}>{k}</option>)}</select>
        </label>
      </div>
      <Durum d={d} iskelet="panel">
        {(u) => {
          if (!Object.keys(u.sutun).length || !u.zaman.length) return <p className="an-not">Bu model bu konum için ansambl verisi vermiyor.</p>;
          if (tanim.degisken === "precipitation") {
            const y = hesap.yagisOlasiligi(u, esik);
            return (
              <>
                <div className="an-cipler" role="group" aria-label="Eşik: günlük yağış en az">
                  {[1, 5, 10, 20].map((e) => <button key={e} type="button" className="cip" aria-pressed={e === esik} onClick={() => setEsik(e)}>{e} mm</button>)}
                </div>
                <section className="ak" aria-label="Günlük yağış olasılığı">
                  <NasilOkunur>Günlük {esik} mm'den fazla yağış olasılığı: üyelerin yüzde kaçı o gün bu kadar yağış veriyor.</NasilOkunur>
                  <OlasilikGrafigi y={y} />
                </section>
                {y.metin && <div className="uy bilgi an-uyum"><p>{kalin(y.metin.replace(/(\d)\.(\d+)(?= mm)/g, "$1,$2"))}</p></div>}
              </>
            );
          }
          const o = hesap.ansamblOzeti(u, tanim.birim);
          return (
            <>
              <section className="ak" aria-label="Ansambl tahmini">
                <NasilOkunur>İnce çizgiler {o.uyeSayisi} üyenin her biri, yani olası bir gelecek. Mavi bant üyelerin %80'inin kaldığı aralık, kalın çizgi ortanca. Bant genişledikçe tahmine güven azalır.</NasilOkunur>
                <AnsamblGrafigi u={u} o={o} birim={tanim.birim} baslik={ad} />
              </section>
              <dl className="an-ozet">
                <div><dt>Ortanca aralığı</dt><dd>{o.ortancaAraligi}</dd></div>
                <div><dt>İlk gün belirsizlik</dt><dd>{o.ilkGun.replace(".", ",")}</dd></div>
                <div><dt>Son gün belirsizlik</dt><dd>{o.sonGun.replace(".", ",")} <small>({o.kat.replace(".", ",")})</small></dd></div>
              </dl>
            </>
          );
        }}
      </Durum>
    </>
  );
}

function AnsamblGrafigi({ u, o, birim, baslik }: { u: Tablo; o: hesap.AnsamblOzeti; birim: string; baslik: string }) {
  const c = useMemo(() => {
    const paneller: Panel[] = [{ baslik: `${baslik} (${birim})`, boy: 230, seriler: [
      ...Object.values(u.sutun).map((v, k): Seri => ({ tur: "cizgi", ad: k === 0 ? "Üyeler" : undefined, deger: v, renk: MUREKKEP, kalinlik: 0.6, opaklik: 0.24, duz: true, sessiz: true })),
      { tur: "bant", ad: "%10–%90 aralığı", alt: o.p10, ust: o.p90, renk: MAVI },
      { tur: "cizgi", ad: "Ortanca", deger: o.ortanca, renk: MAVI, kalinlik: 2.4, duz: true },
    ] }];
    return {
      paneller,
      ipucu: (i: number) => (
        <>
          <IpucuBasligi>{saatYaz(u.zaman[i]!)}</IpucuBasligi>
          <IpucuSatiri renk={MAVI} ad="Ortanca" deger={`${sayi(o.ortanca[i], 1)} ${birim}`} />
          <IpucuSatiri ad="%10–%90" deger={`${sayi(o.p10[i], 1)} – ${sayi(o.p90[i], 1)} ${birim}`} />
        </>
      ),
      tablo: { basliklar: ["Zaman", "%10", "Ortanca", "%90"], satir: (i: number) => [saatYaz(u.zaman[i]!), sayi(o.p10[i], 1), sayi(o.ortanca[i], 1), sayi(o.p90[i], 1)] },
      xEtiket: zamanYazisi(u.zaman), dikey: gunBasi(u.zaman),
    };
  }, [u, o, birim, baslik]);
  return <Cizelge n={u.zaman.length} paneller={c.paneller} xEtiket={c.xEtiket} dikey={c.dikey} ipucu={c.ipucu} tablo={c.tablo}
                  etiket="Ansambl üyeleri, ortanca ve yüzde 10–90 aralığı" />;
}

function OlasilikGrafigi({ y }: { y: hesap.YagisOlasiligi }) {
  const c = useMemo(() => {
    const paneller: Panel[] = [{ boy: 170, ustBosluk: 22, taban: 0, tavan: 100, cizgiler: [0, 50, 100], bicim: (v) => `%${v}`,
      seriler: [{ tur: "cubuk", deger: y.olasilik, renk: MAVI, etiket: (v) => `%${Math.round(v)}` }] }];
    return {
      paneller,
      xEtiket: (i: number) => `${GUNLER[haftaGunu(y.gun[i]!)]} ${y.gun[i]!.slice(8, 10)}`,
      ipucu: (i: number) => (
        <>
          <IpucuBasligi>{gunYaz(y.gun[i]!)}</IpucuBasligi>
          <IpucuSatiri renk={MAVI} ad="Olasılık" deger={`%${sayi(y.olasilik[i])}`} />
          <IpucuSatiri ad="Ortanca" deger={`${sayi(y.dagilim[i]!.ortanca, 1)} mm`} />
          <IpucuSatiri ad="En ıslak senaryo" deger={`${sayi(y.dagilim[i]!.enCok, 1)} mm`} />
        </>
      ),
      tablo: { basliklar: ["Gün", "Olasılık", "Ortanca mm", "En ıslak mm"],
               satir: (i: number) => [gunYaz(y.gun[i]!), `%${sayi(y.olasilik[i])}`, sayi(y.dagilim[i]!.ortanca, 1), sayi(y.dagilim[i]!.enCok, 1)] },
    };
  }, [y]);
  return <Cizelge n={y.gun.length} bant paneller={c.paneller} xEtiket={c.xEtiket} ipucu={c.ipucu} tablo={c.tablo} etiket="Günlük yağış olasılığı" />;
}

// ------------------------------------------------------------------ panel
const SEKMELER = [["meteogram", "Meteogram"], ["modeller", "Modeller"], ["ansambl", "Ansambl"]] as const;
type Sekme = (typeof SEKMELER)[number][0];

export function Analiz({ istemci, konum, tahmin, model }: { istemci: Istemci; konum: Konum; tahmin: Tahmin; model: ModelKodu }) {
  const [sekme, setSekme] = useState<Sekme>("meteogram");
  const [gun, setGun] = useState(5);
  return (
    <div className="an">
      <div className="an-bas">
        <h2 className="an-yer">{konum.ad}</h2>
        <div className="anahtar notr" role="group" aria-label="Dönem">
          {[2, 5, 10].map((g) => <button key={g} type="button" aria-pressed={g === gun} onClick={() => setGun(g)}>{g} gün</button>)}
        </div>
      </div>
      <div className="an-sekmeler" role="tablist" aria-label="Analiz">
        {SEKMELER.map(([k, ad]) => <button key={k} type="button" role="tab" aria-selected={sekme === k} onClick={() => setSekme(k)}>{ad}</button>)}
      </div>
      <div role="tabpanel">
        {sekme === "meteogram" && <Meteogram istemci={istemci} konum={konum} tahmin={tahmin} model={model} gun={gun} />}
        {sekme === "modeller" && <Modeller istemci={istemci} konum={konum} gun={gun} />}
        {sekme === "ansambl" && <Ansambl istemci={istemci} konum={konum} gun={gun} />}
      </div>
    </div>
  );
}

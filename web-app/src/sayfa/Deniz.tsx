/** Balıkçılık ve deniz: dalga, rüzgâr ve görüşe göre saat saat denize çıkış durumu; su sıcaklığı, deniz seviyesi
 * ve balık için uygun zamanlar. Streamlit'teki `app_pages/balikcilik.py` sayfasının karşılığı; hesaplar
 * `hesap/deniz.ts` içinde. Resmî bir seyir uyarısı değildir. */
import { useMemo, useState } from "react";
import { Cizelge, IpucuBasligi, IpucuSatiri, type Panel } from "../grafik/Cizelge";
import { ay as ayEvresi, balikGostergesi, denizVerisi, enYakinDeniz, guvenlik, pencereler, SEVIYE_AD, SEVIYE_RENK } from "../hesap/deniz";
import { kerteriz, YON8, yonAdi } from "../ortak/cografya";
import { ilkEnBuyuk, ortalama } from "../ortak/dizi";
import { GUNLER, gunYaz, haftaGunu, saatEkle, saatFarki, zamanYaz } from "../ortak/zaman";
import { simdiden, simdikiSaat, tahmin as tahminGetir } from "../veri/openMeteo";
import type { Deger, GunlukTablo, Tablo } from "../veri/tipler";
import { Bolum, Durum, isaretli, kalin, Not, Olcut, Rehber, type SayfaOzellik, SayfaBasligi, sayi, useVeri } from "./ortak";

const MAVI = "#2A6FB0", TURUNCU = "#B2602A", GRI = "#8A968E", DENIZ_YESILI = "#1F8A66";
const gunSaat = (t: string) => `${GUNLER[haftaGunu(t)]} ${t.slice(11, 16)}`;
const gunBasi = (zaman: readonly string[]) => (i: number) => zaman[i]!.endsWith("T00:00");
const zamanYazisi = (zaman: readonly string[]) => (i: number) => (zaman[i]!.endsWith("T00:00") ? gunYaz(zaman[i]!) : zaman[i]!.endsWith("T12:00") ? "12" : null);

/** Hava tablosundan, verilen zamanlara denk gelen değerler (yoksa null). */
function hizala(hava: Tablo, ad: string, zaman: readonly string[]): Deger[] {
  const yer = new Map(hava.zaman.map((z, i) => [z, i]));
  const v = hava.sutun[ad] ?? [];
  return zaman.map((z) => { const i = yer.get(z); return i === undefined ? null : v[i] ?? null; });
}

/** İlk `gun` günün, dalga yüksekliği olan satırları. */
function kirp(t: Tablo, gun: number): Tablo {
  if (!t.zaman.length) return t;
  const son = saatEkle(t.zaman[0]!, gun * 24), dalga = t.sutun.wave_height ?? [];
  const sira = t.zaman.map((_, i) => i).filter((i) => t.zaman[i]! < son && dalga[i] != null);
  return { zaman: sira.map((i) => t.zaman[i]!), sutun: Object.fromEntries(Object.entries(t.sutun).map(([k, v]) => [k, sira.map((i) => v[i] ?? null)])) };
}

export function Deniz({ istemci, konum, tahmin }: SayfaOzellik) {
  const [gun, setGun] = useState(5);
  const tz = tahmin.tz;
  const d = useVeri(async () => {
    const nokta = await enYakinDeniz(istemci, konum.lat, konum.lon);
    if (!nokta) return null;
    const kd = { ...konum, lat: nokta.lat, lon: nokta.lon, tz };
    const [deniz, hava] = await Promise.all([denizVerisi(istemci, nokta.lat, nokta.lon, tz, Math.max(gun, 3) + 1), tahminGetir(istemci, kd)]);
    return { nokta, deniz: kirp(deniz.tablo, gun), hava: simdiden(hava.saatlik, simdikiSaat(hava.tz)), gunluk: hava.gunluk };
  }, [istemci, konum.lat, konum.lon, tz, gun]);

  return (
    <div className="sy">
      <SayfaBasligi baslik={`Balıkçılık ve deniz · ${konum.ad}`}>
        Dalga, rüzgâr ve görüşe göre saat saat denize çıkış durumu; su sıcaklığı, deniz seviyesi ve balık için uygun zamanlar. <strong>Bu sayfa resmî bir seyir uyarısı değildir.</strong>
      </SayfaBasligi>
      <div className="an-cipler" role="group" aria-label="Dönem">
        {[3, 5, 7].map((g) => <button key={g} type="button" className="cip" aria-pressed={g === gun} onClick={() => setGun(g)}>{g} gün</button>)}
      </div>
      <Durum d={d} bekleme="Deniz verisi indiriliyor…">
        {(v) => {
          if (!v) return <Not tur="dikkat" baslik="Bu konum denize uzak">Seçili konumun yaklaşık 110 km çevresinde deniz verisi yok. Kıyıda bir şehir ara (ör. Giresun, Sinop, İzmir, Antalya) ya da haritada denizde bir noktaya dokun.</Not>;
          if (!v.deniz.zaman.length) return <p className="an-not an-hata" role="alert">Deniz tahmini alınamadı. Biraz sonra tekrar dene.</p>;
          const yon = YON8[Math.floor(kerteriz(konum.lat, konum.lon, v.nokta.lat, v.nokta.lon) / 45 + 0.5) % 8];
          return (
            <>
              {v.nokta.km > 1 && <Not>{kalin(`Konum karada; değerler **${sayi(v.nokta.km)} km ${yon}** yöndeki en yakın deniz noktasından alındı.`)}</Not>}
              <Icerik d={v.deniz} hava={v.hava} gunluk={v.gunluk} denizYonu={v.nokta.yon} />
            </>
          );
        }}
      </Durum>
    </div>
  );
}

function Icerik({ d, hava, gunluk, denizYonu }: { d: Tablo; hava: Tablo; gunluk: GunlukTablo; denizYonu: number | null }) {
  const h = useMemo(() => {
    const z = d.zaman, s = guvenlik(d, hava, denizYonu), g = balikGostergesi(d, hava, gunluk);
    const sutun = (ad: string) => d.sutun[ad] ?? z.map(() => null);
    const dalga = sutun("wave_height"), periyot = sutun("wave_period"), su = sutun("sea_surface_temperature"), akinti = sutun("ocean_current_velocity");
    const hamle = hizala(hava, "wind_gusts_10m", z), ruzgar = hizala(hava, "wind_speed_10m", z), yon = hizala(hava, "wind_direction_10m", z),
          gorus = hizala(hava, "visibility", z), gunduz = hizala(hava, "is_day", z);
    const uygun = pencereler(z, s.genel.map((x) => x <= 1), 3);
    const kotu = s.genel.map((x) => x >= 2), riskli = pencereler(z, kotu, 1), kara = pencereler(z, s.kara_ruzgari, 1);

    const seviye = s.genel[0]!;
    let ozet = seviye >= 2 ? `Şu an küçük tekneler için **${SEVIYE_AD[seviye]!.toLocaleLowerCase("tr")}**.` : `Şu an durum: **${SEVIYE_AD[seviye]!.toLocaleLowerCase("tr")}**.`;
    if (uygun[0]) {
      const [a0, b0] = uygun[0];
      ozet += ` İlk uygun ya da dikkatle çıkılabilecek aralık **${gunSaat(a0)} – ${b0.slice(0, 10) === a0.slice(0, 10) ? b0.slice(11, 16) : gunSaat(b0)}**.`;
    } else ozet += " Seçilen dönemde en az 3 saat sürecek uygun bir aralık yok.";
    const sonra = z.findIndex((_, i) => i > 0 && s.genel[i]! >= 2);
    if (seviye < 2 && sonra > 0) ozet += ` **${gunSaat(z[sonra]!)}** itibarıyla koşullar kötüleşiyor.`;

    const sayac: [string, number][] = [["dalga", s.dalga.filter((x) => x >= 2).length], ["rüzgâr", s.ruzgar.filter((x) => x >= 2).length],
                                       ["görüş", s.gorus.filter((x) => x >= 2).length], ["fırtına", s.firtina.filter((x) => x >= 2).length]];
    const neden = sayac.reduce((en, x) => (x[1] > en[1] ? x : en))[0];
    const enDalga = ilkEnBuyuk(dalga), enHamle = Math.max(...hamle.filter((x): x is number => x != null), -Infinity);

    // balık için en iyi dört dönem: deniz uygunken göstergenin 50'yi geçtiği aralıklar, ortalamaya göre
    const guvenli = s.genel.map((x) => x <= 1);
    const dilim = (a: string, b: string) => z.map((_, i) => i).filter((i) => z[i]! >= a && z[i]! < b);
    const iyi = pencereler(z, g.toplam.map((t, i) => t >= 50 && guvenli[i]!), 1)
      .map(([a, b]) => ({ a, b, sira: dilim(a, b) }))
      .map((p) => ({ ...p, ort: ortalama(p.sira.map((i) => g.toplam[i]!)) }))
      .sort((p, q) => q.ort - p.ort).slice(0, 4).sort((p, q) => (p.a < q.a ? -1 : 1))
      .map((p) => ({ ...p, nedenler: ([["alacakaranlık", g.alacakaranlik], ["ay konumu", g.ay_konumu], ["basınç", g.basinc], ["hafif rüzgâr", g.ruzgar]] as const)
        .filter(([, v]) => Math.max(...p.sira.map((i) => v[i] ?? 0)) >= 15).map(([ad]) => ad) }));

    const gi = Math.max(gunluk.gun.indexOf(z[0]!.slice(0, 10)), 0);
    return { z, s, g, dalga, periyot, su, akinti, hamle, ruzgar, yon, gorus, gunduz, uygun, riskli, kara, kotu, ozet, neden, enDalga, enHamle, guvenli, iyi,
             ay: ayEvresi(z[0]!), olaylar: [...gunluk.gunDogumu, ...gunluk.gunBatimi].filter((t): t is string => t != null), dogum: gunluk.gunDogumu[gi] ?? null, batim: gunluk.gunBatimi[gi] ?? null, seviye };
  }, [d, hava, gunluk, denizYonu]);
  const { z } = h;
  const suSon = h.su[h.su.length - 1], su0 = h.su[0];

  return (
    <>
      <dl className="olcutler olcutler-6">
        <Olcut baslik="Şu an" deger={SEVIYE_AD[h.seviye]} aciklama="Küçük tekneler (~7 m altı) için dalga, hamle, görüş ve fırtına ölçütlerinin en kötüsü." />
        <Olcut baslik="Dalga" deger={`${sayi(h.dalga[0], 1)} m`} ek={`periyot ${sayi(h.periyot[0])} sn`} aciklama="Belirgin dalga yüksekliği: en yüksek üçte bir dalganın ortalaması." />
        <Olcut baslik="Su sıcaklığı" deger={`${sayi(su0, 1)} °C`} ek={su0 != null && suSon != null ? `${isaretli(suSon - su0)} °C dönem sonunda` : undefined} />
        <Olcut baslik="Rüzgâr" deger={`${sayi(h.ruzgar[0])} km/s`} ek={`hamle ${sayi(h.hamle[0])} · ${h.yon[0] == null ? "—" : yonAdi(h.yon[0])}`} />
        <Olcut baslik="Akıntı" deger={`${sayi(h.akinti[0], 1)} km/s`} aciklama="Yüzey akıntısının hızı. Model çözünürlüğü kıyıya yakın yerel akıntıları (boğazlar, burunlar) tam yakalayamaz." />
        <Olcut baslik="Ay" deger={`${h.ay.simge} ${h.ay.ad}`} ek={`%${sayi(h.ay.aydinlanma)} aydınlık`} />
      </dl>

      <Bolum baslik="Denize çıkılır mı?" />
      <section className="ak" aria-label="Saat saat denize çıkış durumu">
        <p className="ak-ac ak-ozetli">{kalin(h.ozet)}</p>
        <ul className="sev-lejant" aria-label="Renklerin anlamı">{SEVIYE_AD.map((ad, i) => <li key={ad}><i style={{ background: SEVIYE_RENK[i] }} />{ad}</li>)}</ul>
        <GuvenlikSeridi h={h} />
      </section>

      <div className="uyarilar sy-not">
        {h.uygun.length
          ? <div className="uy iyi"><h3>Uygun ya da dikkatle çıkılabilecek dönemler</h3>
              <ul className="sy-liste">{h.uygun.slice(0, 4).map(([a, b]) => <li key={a}><strong>{zamanYaz(a)} – {b.slice(0, 10) === a.slice(0, 10) ? b.slice(11, 16) : zamanYaz(b)}</strong> ({sayi(saatFarki(b, a))} saat)</li>)}</ul></div>
          : <div className="uy tehlike"><h3>Uygun dönem yok</h3><p>Seçilen dönemde en az 3 saat sürecek uygun bir pencere yok.</p></div>}
        <div className="sy-yigin">
          {h.riskli[0] && (
            <div className="uy dikkat"><h3>Riskli saatler var</h3>
              <p>{kalin(`İlk riskli dönem **${h.riskli[0][0].slice(8, 10)}.${h.riskli[0][0].slice(5, 7)} ${h.riskli[0][0].slice(11, 16)}**. Dönemin en yüksek dalgası ${sayi(h.dalga[h.enDalga], 1)} m (${zamanYaz(z[h.enDalga]!)}), en kuvvetli hamle ${sayi(h.enHamle)} km/s. Belirleyici etken çoğunlukla ${h.neden}.`)}</p></div>
          )}
          {h.kara[0] && (
            <div className="uy tehlike"><h3>Kara rüzgârı</h3>
              <p>{kalin(`${h.kara[0][0].slice(8, 10)}.${h.kara[0][0].slice(5, 7)} ${h.kara[0][0].slice(11, 16)} itibarıyla rüzgâr **karadan denize** esiyor. Kıyıda deniz sakin görünür ama açıldıkça rüzgâr ve dalga artar; motor arızasında tekne açığa sürüklenir.`)}</p></div>
          )}
        </div>
      </div>

      <div className="sy-uc">
        <section className="yz sy-kart" aria-label="Rüzgâr, şimdi">
          <h3>Rüzgâr, şimdi</h3>
          <Pusula yon={h.yon[0] ?? null} hiz={h.ruzgar[0] ?? null} hamle={h.hamle[0] ?? null} />
        </section>
        <section className="yz sy-kart" aria-label="Su ve ışık">
          <h3>Su ve ışık</h3>
          <dl className="sy-bilgi">
            <div><dt>Su sıcaklığı</dt><dd>{sayi(su0, 1)} °C</dd></div>
            <div><dt>Dalga periyodu</dt><dd>{sayi(h.periyot[0])} sn</dd></div>
            <div><dt>Gün doğumu</dt><dd>{h.dogum?.slice(11, 16) ?? "—"}</dd></div>
            <div><dt>Gün batımı</dt><dd>{h.batim?.slice(11, 16) ?? "—"}</dd></div>
            <div><dt>Ay</dt><dd>{h.ay.ad}, %{sayi(h.ay.aydinlanma)}</dd></div>
            <div><dt>Görüş</dt><dd>{h.gorus[0] == null ? "—" : `${sayi(h.gorus[0] / 1000)} km`}</dd></div>
          </dl>
        </section>
        <section className="yz sy-kart" aria-label="Dönüş saati ve dalga türleri">
          <h3>Dönüş saatini planla</h3>
          <p>Dalga bir anda değil, yavaş yavaş büyür. Uygun aralığın bitiminden en az bir saat önce kıyıya dönmeye başla{h.uygun[0] ? <>: ilk aralık için bu, en geç <strong>{gunSaat(saatEkle(h.uygun[0][1], -1))}</strong> demek.</> : "."}</p>
          <h3>Rüzgâr dalgası ve soluğan</h3>
          <p>Rüzgâr dalgası o anki rüzgârla oluşur; kısa aralıklı ve diktir. Soluğan uzaktaki bir fırtınadan gelir; rüzgâr dinse de saatlerce sürer. Aşağıdaki dalga grafiğinde ikisi ayrı çizilir.</p>
        </section>
      </div>

      <details className="yz rehber">
        <summary>Eşikler nasıl belirlendi? Beaufort ve Douglas ölçekleri</summary>
        <p>Değerlendirme <strong>küçük tekneler</strong> (yaklaşık 7 m altı, kayık, sandal, olta teknesi) içindir. Dört ölçütün en kötüsü “Genel” satırına yazılır.</p>
        <div className="sy-tablo"><table>
          <thead><tr><th>Durum</th><th>Dalga (belirgin)</th><th>Hamle</th><th>Görüş</th><th>Karşılığı</th></tr></thead>
          <tbody>
            <tr><th>Uygun</th><td>&lt; 0,5 m</td><td>&lt; 25 km/s</td><td>&gt; 4 km</td><td>Douglas 0–2 (sakin–hafif), Beaufort 0–4</td></tr>
            <tr><th>Dikkat</th><td>0,5–1 m</td><td>25–38 km/s</td><td>1–4 km</td><td>Douglas 3 (hafif dalgalı), Beaufort 5</td></tr>
            <tr><th>Riskli</th><td>1–2 m</td><td>38–50 km/s</td><td>&lt; 1 km</td><td>Douglas 4 (dalgalı), Beaufort 6</td></tr>
            <tr><th>Tehlikeli</th><td>&gt; 2 m</td><td>&gt; 50 km/s</td><td>—</td><td>Douglas 5+ (çok dalgalı), Beaufort 7+ ya da gök gürültülü fırtına</td></tr>
          </tbody>
        </table></div>
        <p><strong>Kara rüzgârı:</strong> Rüzgâr karadan denize doğru 20 km/s'ten kuvvetli esiyorsa durum en az “Dikkat” olur.</p>
      </details>

      <Bolum baslik="Balık için uygun zamanlar" />
      <section className="ak" aria-label="Balıkçı göstergesi">
        <p className="ak-ac">Gösterge 0–100 arasıdır. Yeşil çubuklar denize çıkılabilecek saatler, gri çubuklar denizin uygun olmadığı saatlerdir; mavi dikey çizgiler gün doğumu ve batımı.</p>
        <BalikGrafigi h={h} />
      </section>
      {h.iyi.length ? (
        <div className="olcutler sy-not">
          {h.iyi.map((p) => <div key={p.a} className="yz olcut"><dt>{gunYaz(p.a)}</dt><dd>{p.a.slice(11, 16)} – {p.b.slice(11, 16)}</dd><p>Gösterge {sayi(p.ort)} · {p.nedenler.join(", ") || "birkaç küçük etken"}</p></div>)}
        </div>
      ) : <Not>Deniz koşullarının uygun olduğu saatlerde göstergenin 50'yi geçtiği bir dönem yok.</Not>}
      <details className="yz rehber">
        <summary>Bu gösterge nasıl hesaplanıyor? (Önce bunu oku)</summary>
        <p>Bu gösterge <strong>balıkçıların yaygın gözlemlerine</strong> dayanır; balık davranışını öngören, bilimsel olarak doğrulanmış bir model <strong>değildir</strong>. Balığın yeri ve iştahı su sıcaklığına, akıntıya, mevsime, yeme ve türe göre çok değişir. Göstergeyi “hangi saatleri denemeye değer?” sorusu için kaba bir rehber olarak kullan.</p>
        <div className="sy-tablo"><table>
          <thead><tr><th>Etken</th><th>En fazla</th><th>Gerekçe</th></tr></thead>
          <tbody>
            <tr><th>Alacakaranlık</th><td>30</td><td>Gün doğumu ve batımına yakın saatlerde (±1,5 sa) ışık azalır, birçok tür yüzeye ve kıyıya yaklaşıp avlanır. Bu, bilimsel olarak da en iyi desteklenen etkendir.</td></tr>
            <tr><th>Ay konumu (solunar)</th><td>20</td><td>Ayın tepede ya da ayak altında olduğu saatler “ana”, doğuş/batış saatleri “ara” dönem kabul edilir. Kanıtı zayıftır; burada yaklaşık hesaplanır.</td></tr>
            <tr><th>Ay evresi</th><td>10</td><td>Yeni ay ve dolunay civarında gelgit akıntıları güçlenir; Türkiye denizlerinde gelgit çok küçük olduğundan etkisi sınırlıdır. Bugün: {h.ay.simge} {h.ay.ad}.</td></tr>
            <tr><th>Basınç eğilimi</th><td>20</td><td>Balıkçılar, cephe öncesi yavaş düşen basınçta avın arttığını, hızlı düşüşte ve cephe sonrası yükselişte azaldığını söyler.</td></tr>
            <tr><th>Rüzgâr</th><td>15</td><td>Hafif rüzgâr yüzeyi kırıştırır, balık daha az ürker; kuvvetli rüzgâr oltayı ve tekneyi zorlar.</td></tr>
          </tbody>
        </table></div>
        <p>Denize çıkmanın uygun olmadığı saatler <strong>gri</strong> gösterilir ve öneri listesine alınmaz.</p>
      </details>

      <Bolum baslik="Dalgalar" />
      <section className="ak" aria-label="Dalga yüksekliği ve bileşenleri">
        <DalgaGrafigi d={d} />
      </section>
      <Rehber baslik="Dalga grafiği nasıl okunur?" adimlar={[
        ["Belirgin dalga yüksekliği", "Tahminlerdeki sayı en yüksek üçte bir dalganın ortalamasıdır; gözle tahmin edilen dalga boyuna yakındır. Ama **tek tek dalgalar bunun iki katına** çıkabilir: 1 m'lik denizde 2 m'lik dalga ile karşılaşmak olağandır. İpucunda “olası en büyük tek dalga” bu yüzden ayrıca verildi."],
        ["Periyot", "İki dalga tepesi arasındaki süre. Kısa periyot (4–5 sn altı) dik ve sert dalga demektir; aynı yükseklikte bile küçük tekneyi uzun periyotlu dalgadan çok daha fazla zorlar."],
        ["Rüzgâr dalgası ve soluğan", "Rüzgâr dalgası o anda esen rüzgârın ürettiği kısa, düzensiz dalgadır. **Soluğan** (swell) uzakta esmiş rüzgârın gönderdiği uzun, düzenli dalgadır; rüzgâr dinmiş olsa bile sürebilir. Sakin havada kıyıda beklenmedik dalga görmenin nedeni çoğu zaman soluğandır."],
        ["Dalga yönü", "İpucunda dalgaların geldiği yön yazar. Dalganın geldiği yöne açık kıyılar ve limanlar en çok etkilenir."],
      ]} />

      <div className="sy-esit">
        <div>
          <Bolum baslik="Su sıcaklığı" />
          <section className="ak" aria-label="Deniz suyu sıcaklığı">
            <TekSeri zaman={z} deger={h.su} ad="Su sıcaklığı" birim="°C" renk={TURUNCU} hane={1} />
            <p className="ak-ac">Model, denizin en üst katmanının sıcaklığını verir. Balıklar türlerine göre belirli sıcaklık aralıklarını izler; sonbaharda sular soğudukça göç eden türler (ör. Karadeniz'de hamsi, palamut) kıyı boyunca yer değiştirir. Birkaç günde 1–2 °C'lik ani değişimler avı etkileyebilir.</p>
          </section>
        </div>
        <div>
          <Bolum baslik="Deniz seviyesi" />
          <section className="ak" aria-label="Deniz seviyesi">
            <TekSeri zaman={z} deger={d.sutun.sea_level_height_msl ?? z.map(() => null)} ad="Deniz seviyesi" birim="m" renk={MAVI} hane={2} />
            <p className="ak-ac">Gelgit ve rüzgâr/basınç kaynaklı kabarmanın toplamı. Karadeniz ve Ege'de gelgit yalnızca birkaç santimetredir; seviyedeki değişimi daha çok kıyıya doğru esen rüzgâr ve düşük basınç yapar. Seviye yükseldiğinde alçak iskele ve kumsallar su altında kalabilir.</p>
          </section>
        </div>
      </div>

      <p className="sy-acil">Denize çıkmadan önce <a href="https://www.mgm.gov.tr" target="_blank" rel="noreferrer">MGM</a> deniz tahminlerine ve uyarılarına bak. Acil durumda Sahil Güvenlik: <strong>158</strong>, VHF <strong>Kanal 16</strong>. Av yasakları ve boy sınırları için Tarım ve Orman Bakanlığı'nın güncel su ürünleri tebliğine uy.</p>
    </>
  );
}

type Hesap = { z: string[]; s: ReturnType<typeof guvenlik>; g: ReturnType<typeof balikGostergesi>; dalga: Deger[]; periyot: Deger[]; hamle: Deger[]; yon: Deger[]; gorus: Deger[];
               gunduz: Deger[]; guvenli: boolean[]; olaylar: string[] };

/** Saat saat durum: üstte genel sonuç, altında onu belirleyen üç etken. */
function GuvenlikSeridi({ h }: { h: Hesap }) {
  const c = useMemo(() => {
    const { z, s } = h;
    const renk = (v: readonly number[]) => v.map((x) => SEVIYE_RENK[x] ?? null);
    const satir = (baslik: string, v: readonly number[], boy: number): Panel => ({ baslik, boy, eksensiz: true, seriler: [{ tur: "serit", renkler: renk(v) }] });
    return {
      paneller: [satir("Genel", s.genel, 30), satir("Dalga", s.dalga, 14), satir("Rüzgâr", s.ruzgar, 14), satir("Görüş", s.gorus, 14)],
      ipucu: (i: number) => (
        <>
          <IpucuBasligi>{zamanYaz(z[i]!)}{h.gunduz[i] === 0 ? " · gece" : ""}</IpucuBasligi>
          <IpucuSatiri ad="Genel" deger={SEVIYE_AD[s.genel[i]!]!} />
          <IpucuSatiri ad="Dalga" deger={`${sayi(h.dalga[i], 1)} m · ${sayi(h.periyot[i])} sn`} />
          <IpucuSatiri ad="Hamle" deger={`${sayi(h.hamle[i])} km/s ${h.yon[i] == null ? "" : yonAdi(h.yon[i]!)}`} />
          <IpucuSatiri ad="Görüş" deger={h.gorus[i] == null ? "—" : `${sayi(h.gorus[i]! / 1000, 1)} km`} />
          <IpucuSatiri ad="Kara rüzgârı" deger={s.kara_ruzgari[i] ? "Evet" : "Hayır"} />
        </>
      ),
      tablo: { basliklar: ["Zaman", "Genel", "Dalga m", "Periyot sn", "Hamle km/s", "Rüzgâr yönü", "Görüş km", "Kara rüzgârı"],
               satir: (i: number) => [zamanYaz(z[i]!), SEVIYE_AD[s.genel[i]!]!, sayi(h.dalga[i], 1), sayi(h.periyot[i]), sayi(h.hamle[i]), h.yon[i] == null ? "—" : yonAdi(h.yon[i]!),
                                      h.gorus[i] == null ? "—" : sayi(h.gorus[i]! / 1000, 1), s.kara_ruzgari[i] ? "Evet" : "Hayır"] },
    };
  }, [h]);
  return <Cizelge n={h.z.length} bant paneller={c.paneller} xEtiket={zamanYazisi(h.z)} dikey={gunBasi(h.z)} ipucu={c.ipucu} tablo={c.tablo} etiket="Saat saat denize çıkış durumu" />;
}

function BalikGrafigi({ h }: { h: Hesap }) {
  const c = useMemo(() => {
    const { z, g, guvenli } = h;
    // gün doğumu ve batımı: o saatin şeridine dikey işaret
    const isaret = h.olaylar.map((t) => z.findIndex((x) => x.slice(0, 13) === t.slice(0, 13))).filter((i) => i >= 0);
    const paneller: Panel[] = [{ baslik: "Gösterge (0–100)", boy: 190, taban: 0, tavan: 100, cizgiler: [0, 25, 50, 75, 100], isaret, seriler: [
      { tur: "cubuk", ad: "Denize çıkılabilir", deger: g.toplam.map((t, i) => (guvenli[i] ? t : null)), renk: DENIZ_YESILI },
      { tur: "cubuk", ad: "Deniz uygun değil", deger: g.toplam.map((t, i) => (guvenli[i] ? null : t)), renk: GRI },
    ] }];
    return {
      paneller,
      ipucu: (i: number) => (
        <>
          <IpucuBasligi>{zamanYaz(z[i]!)}</IpucuBasligi>
          <IpucuSatiri renk={guvenli[i] ? DENIZ_YESILI : GRI} ad="Gösterge" deger={sayi(g.toplam[i])} />
          <IpucuSatiri ad="Alacakaranlık" deger={sayi(g.alacakaranlik[i])} />
          <IpucuSatiri ad="Ay konumu" deger={sayi(g.ay_konumu[i])} />
          <IpucuSatiri ad="Ay evresi" deger={sayi(g.ay_evresi[i])} />
          <IpucuSatiri ad="Basınç eğilimi" deger={`${sayi(g.basinc[i])} (${isaretli(g.dp[i])} hPa/3 sa)`} />
          <IpucuSatiri ad="Rüzgâr" deger={sayi(g.ruzgar[i])} />
          <IpucuSatiri ad="Deniz" deger={guvenli[i] ? "çıkılabilir" : "uygun değil"} />
        </>
      ),
      tablo: { basliklar: ["Zaman", "Gösterge", "Alacakaranlık", "Ay konumu", "Ay evresi", "Basınç", "Rüzgâr", "Deniz"],
               satir: (i: number) => [zamanYaz(z[i]!), sayi(g.toplam[i]), sayi(g.alacakaranlik[i]), sayi(g.ay_konumu[i]), sayi(g.ay_evresi[i]), sayi(g.basinc[i]), sayi(g.ruzgar[i]), guvenli[i] ? "çıkılabilir" : "uygun değil"] },
    };
  }, [h]);
  return <Cizelge n={h.z.length} bant paneller={c.paneller} xEtiket={zamanYazisi(h.z)} dikey={gunBasi(h.z)} ipucu={c.ipucu} tablo={c.tablo} etiket="Balıkçı göstergesi" />;
}

function DalgaGrafigi({ d }: { d: Tablo }) {
  const c = useMemo(() => {
    const z = d.zaman, s = (ad: string) => d.sutun[ad] ?? z.map(() => null);
    const toplam = s("wave_height"), ruzgar = s("wind_wave_height"), solugan = s("swell_wave_height"), periyot = s("wave_period"), yon = s("wave_direction");
    const paneller: Panel[] = [{ baslik: "Dalga yüksekliği (m)", boy: 240, taban: 0,
      esik: [{ deger: 0.5, renk: "#B8860B", ad: "0,5 m: dikkat" }, { deger: 1, renk: "#C8621A", ad: "1 m: küçük tekne için riskli" }, { deger: 2, renk: "#B5352B", ad: "2 m: tehlikeli" }],
      seriler: [
        { tur: "cizgi", ad: "Toplam (belirgin)", deger: toplam, renk: MAVI, kalinlik: 3 },
        { tur: "cizgi", ad: "Rüzgâr dalgası", deger: ruzgar, renk: MAVI, kalinlik: 1.6, desen: "kesik" },
        { tur: "cizgi", ad: "Soluğan", deger: solugan, renk: MAVI, kalinlik: 1.8, desen: "nokta" },
      ] }];
    return {
      paneller,
      ipucu: (i: number) => (
        <>
          <IpucuBasligi>{zamanYaz(z[i]!)}</IpucuBasligi>
          <IpucuSatiri renk={MAVI} ad="Belirgin dalga" deger={`${sayi(toplam[i], 2)} m`} />
          <IpucuSatiri ad="Olası en büyük tek dalga" deger={toplam[i] == null ? "—" : `${sayi(toplam[i]! * 1.9, 1)} m`} />
          <IpucuSatiri ad="Periyot" deger={`${sayi(periyot[i], 1)} sn`} />
          <IpucuSatiri renk={MAVI} desen="kesik" ad="Rüzgâr dalgası" deger={`${sayi(ruzgar[i], 2)} m`} />
          <IpucuSatiri renk={MAVI} desen="nokta" ad="Soluğan" deger={`${sayi(solugan[i], 2)} m`} />
          <IpucuSatiri ad="Geldiği yön" deger={yon[i] == null ? "—" : yonAdi(yon[i]!)} />
        </>
      ),
      tablo: { basliklar: ["Zaman", "Belirgin m", "Rüzgâr dalgası m", "Soluğan m", "Periyot sn", "Geldiği yön"],
               satir: (i: number) => [zamanYaz(z[i]!), sayi(toplam[i], 2), sayi(ruzgar[i], 2), sayi(solugan[i], 2), sayi(periyot[i], 1), yon[i] == null ? "—" : yonAdi(yon[i]!)] },
    };
  }, [d]);
  return <Cizelge n={d.zaman.length} paneller={c.paneller} xEtiket={zamanYazisi(d.zaman)} dikey={gunBasi(d.zaman)} ipucu={c.ipucu} tablo={c.tablo} etiket="Dalga yüksekliği ve bileşenleri" />;
}

function TekSeri({ zaman, deger, ad, birim, renk, hane }: { zaman: readonly string[]; deger: readonly Deger[]; ad: string; birim: string; renk: string; hane: number }) {
  const c = useMemo(() => ({
    paneller: [{ baslik: `${ad} (${birim})`, boy: 170, seriler: [{ tur: "cizgi" as const, deger, renk, kalinlik: 2.4 }] }],
    ipucu: (i: number) => <><IpucuBasligi>{zamanYaz(zaman[i]!)}</IpucuBasligi><IpucuSatiri renk={renk} ad={ad} deger={`${sayi(deger[i], hane)} ${birim}`} /></>,
    tablo: { basliklar: ["Zaman", `${ad} ${birim}`], satir: (i: number) => [zamanYaz(zaman[i]!), sayi(deger[i], hane)] },
  }), [zaman, deger, ad, birim, renk, hane]);
  return <Cizelge n={zaman.length} paneller={c.paneller} xEtiket={zamanYazisi(zaman)} dikey={gunBasi(zaman)} ipucu={c.ipucu} tablo={c.tablo} etiket={ad} />;
}

/** Rüzgâr pusulası: ok rüzgârın estiği yönü (gittiği tarafı) gösterir. */
function Pusula({ yon, hiz, hamle }: { yon: number | null; hiz: number | null; hamle: number | null }) {
  return (
    <div className="pusula">
      <svg viewBox="0 0 120 120" role="img" aria-label={yon == null ? "Rüzgâr yönü bilinmiyor" : `Rüzgâr ${yonAdi(yon)} yönünden esiyor`}>
        <circle cx="60" cy="60" r="46" fill="none" stroke="currentColor" strokeOpacity=".25" strokeWidth="1.5" />
        {[["K", 60, 11], ["D", 111, 64], ["G", 60, 117], ["B", 9, 64]].map(([h, x, y]) => <text key={h} x={x} y={y} textAnchor="middle" fontSize="11" fill="currentColor" opacity=".7">{h}</text>)}
        {yon != null && <g transform={`rotate(${yon + 180} 60 60)`}><path d="M60 24 L69 52 L60 46 L51 52 Z" fill="var(--vurgu)" /><path d="M60 46 V92" stroke="var(--vurgu)" strokeWidth="3" strokeLinecap="round" /></g>}
      </svg>
      <div>
        <p className="pusula-deger">{sayi(hiz)} <small>km/s</small></p>
        <p>{yon == null ? "—" : `${yonAdi(yon)} yönünden`}</p>
        <p>hamle {sayi(hamle)} km/s</p>
      </div>
    </div>
  );
}

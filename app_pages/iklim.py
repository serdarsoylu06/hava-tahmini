import pandas as pd
import streamlit as st

from hava import grafik, iklim
from hava.arayuz import okuma_rehberi
from hava.veri import konum

AYLAR = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"]
AY_TAM = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"]

k = konum()
st.header(f"İklim ve geçmiş · {k['ad']}", anchor=False)
st.caption("Bugünkü hava ve tahmin, bu yerin 1991–2020 mevsim normaliyle ve 1991'den bu yana her yılla "
           "karşılaştırılır. \"Sıcak\" ya da \"yağışlı\" ancak normale göre söylenebilir.")

a = iklim.arsiv(k)
if a is None or a.empty:
    st.error("Geçmiş veri alınamadı. Biraz sonra tekrar dene ya da kenar çubuğundan örnek veri modunu aç.",
             icon=":material/cloud_off:")
    st.stop()
nrm = iklim.normaller(a)
son = iklim.son_gunler(k)
bugun = pd.Timestamp.now(tz=None if k["tz"] == "auto" else k["tz"]).tz_localize(None).normalize()
bugun_n = iklim.normal_al(nrm, [bugun]).iloc[0]

# ---------------------------------------------------------------- özet
m = st.columns(4)
if son is not None and bugun in son.index:
    tmax = son.loc[bugun, "temperature_2m_max"]
    m[0].metric("Bugün en yüksek", f"{tmax:.0f}°", f"{tmax - bugun_n.max_ort:+.1f}° normale göre",
                delta_color="inverse" if tmax < bugun_n.max_ort else "normal", border=True,
                help=f"Bugünün normali {bugun_n.max_ort:.1f}° (en yüksek), {bugun_n.min_ort:.1f}° (en düşük). "
                     f"Yılların %80'inde en yüksek sıcaklık {bugun_n.max_p10:.0f}° ile {bugun_n.max_p90:.0f}° arasında.")
else:
    m[0].metric("Bugünün normali", f"{bugun_n.max_ort:.0f}° / {bugun_n.min_ort:.0f}°", border=True)
g = iklim.ayni_gun_gecmisi(a, bugun)
rekor_s, rekor_k = g.loc[g["max"].idxmax()], g.loc[g["min"].idxmin()]
m[1].metric(f"{bugun.day} {AY_TAM[bugun.month - 1]} rekorları", f"{rekor_s['max']:.0f}° / {rekor_k['min']:.0f}°",
            f"{int(rekor_s.yil)} sıcak · {int(rekor_k.yil)} soğuk", delta_color="off", delta_arrow="off", border=True,
            help="1991'den bu yana bu tarihin (±3 gün ortalaması) en sıcak ve en soğuk yılları.")
y, egim, yil_normal = iklim.yillik(a)
m[2].metric("Isınma eğilimi", f"{egim:+.2f} °C", "her 10 yılda", delta_color="off", delta_arrow="off", border=True,
            help=f"{int(y.index.min())}–{int(y.index.max())} yıllık ortalamalarına doğrusal eğilim. Küresel ortalama "
                 "yaklaşık +0,2 °C/10 yıldır; karalar ve Akdeniz havzası daha hızlı ısınıyor.")
ay = iklim.aylik_yagis(a, son, bugun.year)
gecen = ay.loc[: bugun.month - 1]
oran = gecen.bu_yil.sum() / gecen.normal.sum() * 100 if gecen.normal.sum() else float("nan")
m[3].metric(f"{bugun.year} yağışı", f"%{oran:.0f}", f"normalin (Ocak–{AY_TAM[bugun.month - 2] if bugun.month > 1 else 'Ocak'})",
            delta_color="off", delta_arrow="off", border=True,
            help="Tamamlanmış ayların yağış toplamının aynı ayların 1991–2020 normaline oranı. %100 altı kurak.")

# ---------------------------------------------------------------- son günler ve tahmin
st.subheader("Son günler ve önümüzdeki 10 gün, normale göre", anchor=False)
if son is not None:
    d = son.join(iklim.normal_al(nrm, son.index)).dropna(subset=["temperature_2m_max"])
    st.altair_chart(grafik.normal_bandi(d, bugun), alt="En yüksek sıcaklığın normal bandıyla karşılaştırması")
    gelecek = d[d.index > bugun]
    sapma = (gelecek.temperature_2m_max - gelecek.max_ort).mean()
    if abs(sapma) >= 1:
        st.info(f"Önümüzdeki {len(gelecek)} gün, mevsim normalinden ortalama **{sapma:+.1f} °C** "
                f"{'sıcak' if sapma > 0 else 'soğuk'} görünüyor.", icon=":material/thermostat:")
    st.caption("Gri bant yılların %80'inin kaldığı aralık, kesikli çizgi ortalama normaldir. Bandın dışına çıkan günler "
               "\"mevsim normallerinin üstünde/altında\" sayılır.")
else:
    st.warning("Son günlerin verisi şu an alınamadı.", icon=":material/cloud_off:")

# ---------------------------------------------------------------- aynı gün geçmiş yıllarda
sol, sag = st.columns([1.5, 1], gap="large")
with sol:
    st.subheader(f"{bugun.day} {AY_TAM[bugun.month - 1]} geçmiş yıllarda", anchor=False)
    bu_deger = son.loc[bugun, "temperature_2m_max"] if son is not None and bugun in son.index else None
    cizim, egim_gun = grafik.ayni_gun_grafigi(g, bu_deger, f"{bugun.day} {AYLAR[bugun.month - 1]}")
    st.altair_chart(cizim, alt="Her yıl bugünün tarihindeki en yüksek sıcaklık")
    st.caption(f"Kesikli çizgi eğilimdir: bu tarihte en yüksek sıcaklık on yılda **{egim_gun:+.1f} °C** değişmiş. Turuncu "
               "elmas bu yılın değeri. Tek bir günün eğilimi gürültülüdür; asıl ısınma sinyali yıllık ortalamada görülür.")
with sag:
    st.subheader("Isınma şeritleri", anchor=False)
    st.altair_chart(grafik.isinma_seritleri(y), alt="Yıllık ortalama sıcaklığın normalden farkı")
    st.caption(f"Her şerit bir yıl: mavi normalden ({yil_normal:.1f} °C) soğuk, kırmızı sıcak. Klimatolog Ed Hawkins'in "
               "\"warming stripes\" görselinin bu konum için hesaplanmış hâli. Kaynak: ERA5 yeniden analizi.")
    sicak = y.sort_values("ort", ascending=False).head(3)
    st.markdown("**En sıcak yıllar:** " + ", ".join(f"{int(i)} ({r.sapma:+.1f}°)" for i, r in sicak.iterrows()))

# ---------------------------------------------------------------- yağış
st.subheader(f"{bugun.year} yağışı, aylara göre", anchor=False)
st.altair_chart(grafik.aylik_yagis_grafigi(ay.fillna(0), AYLAR), alt="Bu yılın aylık yağışı ve normali")

okuma_rehberi([
    ("Mevsim normali nedir?", "Dünya Meteoroloji Örgütü'nün tanımıyla 30 yıllık ortalamadır; güncel standart dönem "
     "1991–2020. \"Normal\" tek bir sayı değil bir aralıktır: o tarihte yılların çoğunun düştüğü bant."),
    ("Veri nereden geliyor?", "ERA5, Avrupa Orta Vadeli Hava Tahminleri Merkezi'nin (ECMWF) geçmişteki tüm gözlemleri "
     "aynı modelle birleştirerek ürettiği \"yeniden analiz\"dir: yaklaşık 25 km'lik ızgarada, 1940'tan bugüne kesintisiz. "
     "İstasyon ölçümü değildir; dağlık ve kıyı yerlerde termometreden birkaç derece farklı olabilir, ama yıllar arası "
     "karşılaştırma için tutarlıdır."),
    ("Anomali", "Normalden fark. Meteorologlar \"sıcak hafta\" yerine \"+4 °C anomali\" der; çünkü 25 °C temmuzda serin, "
     "kasımda olağanüstü sıcaktır."),
    ("Rekorlar ve eğilim", "Rekorların büyük kısmının son yıllarda gelmesi ve şeritlerin sağa doğru kızarması, ısınmanın "
     "yerel ölçekteki izidir. Yine de tek bir sıcak gün iklim değişikliğinin kanıtı değildir; kanıt uzun dönem eğilimdir."),
], baslik="Bu sayfa nasıl okunur?")

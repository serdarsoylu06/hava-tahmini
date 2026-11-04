import pandas as pd
import streamlit as st

from hava import deniz, grafik
from hava.arayuz import gun_sayisi, okuma_rehberi
from hava.veri import konum, simdiden, tahmin, yon_adi
from hava.yerler import YONLER, kerteriz
from hava.yorum import gun, zaman

k = konum()
st.header(f"Balıkçılık ve deniz · {k['ad']}", anchor=False)
st.caption("Dalga, rüzgâr ve görüşe göre saat saat denize çıkış durumu; su sıcaklığı, deniz seviyesi ve balık için "
           "uygun zamanlar. **Bu sayfa resmî bir seyir uyarısı değildir.**")

bulunan = deniz.en_yakin_deniz(k["lat"], k["lon"])
if bulunan is None:
    st.warning("Seçili konumun yaklaşık 110 km çevresinde deniz verisi yok. Kenar çubuğundan kıyıda bir şehir ara "
               "(ör. Giresun, Sinop, İzmir, Antalya) ya da Canlı radar veya Tahmin haritaları sayfasında denizde bir noktaya tıkla.",
               title="Bu konum denize uzak", icon=":material/waves:")
    st.stop()
dlat, dlon, km, deniz_yonu = bulunan
if km > 1:
    yon = YONLER[int(kerteriz(k["lat"], k["lon"], dlat, dlon) / 45 + 0.5) % 8]
    st.info(f"Konum karada; değerler **{km:.0f} km {yon}** yöndeki en yakın deniz noktasından alındı.",
            icon=":material/near_me:")

kd = dict(k, lat=dlat, lon=dlon)
d = deniz.deniz_verisi(dlat, dlon, kd, max(gun_sayisi(), 3) + 1)
_, hava, gunluk = tahmin(kd)
hava = simdiden(hava, kd)
d = d.loc[d.index < d.index[0] + pd.Timedelta(days=gun_sayisi())].dropna(subset=["wave_height"])
if d.empty:
    st.error("Deniz tahmini alınamadı. Biraz sonra tekrar dene.", icon=":material/cloud_off:")
    st.stop()
s = deniz.guvenlik(d, hava, deniz_yonu)
g = deniz.balik_gostergesi(d, hava, gunluk)

# ---------------------------------------------------------------- şu an
an = d.index[0]
yas, ay_simge, ay_ad, aydinlik = deniz.ay(an)
seviye = int(s.genel.iloc[0])
m = st.columns(6)
m[0].metric("Şu an", deniz.SEVIYE_AD[seviye], border=True,
            help="Küçük tekneler (~7 m altı) için dalga, hamle, görüş ve fırtına ölçütlerinin en kötüsü.")
m[1].metric("Dalga", f"{d.wave_height.iloc[0]:.1f} m", f"periyot {d.wave_period.iloc[0]:.0f} sn",
            delta_color="off", delta_arrow="off", border=True,
            chart_data=d.wave_height.iloc[:48:2].round(2).tolist(), chart_type="area",
            help="Belirgin dalga yüksekliği: en yüksek üçte bir dalganın ortalaması. Grafik önümüzdeki 48 saat.")
m[2].metric("Su sıcaklığı", f"{d.sea_surface_temperature.iloc[0]:.1f} °C",
            f"{d.sea_surface_temperature.iloc[-1] - d.sea_surface_temperature.iloc[0]:+.1f} °C dönem sonunda",
            delta_color="off", border=True)
m[3].metric("Rüzgâr", f"{hava.wind_speed_10m.iloc[0]:.0f} km/s",
            f"hamle {hava.wind_gusts_10m.iloc[0]:.0f} · {yon_adi(hava.wind_direction_10m.iloc[0])}",
            delta_color="off", delta_arrow="off", border=True)
m[4].metric("Akıntı", f"{d.ocean_current_velocity.iloc[0]:.1f} km/s", border=True,
            help="Yüzey akıntısının hızı. Model çözünürlüğü kıyıya yakın yerel akıntıları (boğazlar, burunlar) "
                 "tam yakalayamaz.")
m[5].metric("Ay", f"{ay_simge} {ay_ad}", f"%{aydinlik:.0f} aydınlık", delta_color="off", delta_arrow="off",
            border=True)

# ---------------------------------------------------------------- denize çıkılır mı?
st.subheader("Denize çıkılır mı?", anchor=False, divider="gray")
st.altair_chart(grafik.guvenlik_seridi(s, d, hava, deniz.SEVIYE_AD, deniz.SEVIYE_RENK),
                alt="Saat saat denize çıkış durumu")
uygun = deniz.pencereler(s.genel <= 1, en_az_saat=3)
kotu = s.genel >= 2
c1, c2 = st.columns(2)
with c1:
    if uygun:
        bitis = lambda a, b: f"{b:%H:%M}" if b.date() == a.date() else zaman(b)
        satirlar = [f"- **{zaman(a)} – {bitis(a, b)}** ({(b - a).total_seconds() / 3600:.0f} saat)"
                    for a, b in uygun[:4]]
        st.success("\n".join(satirlar), title="Uygun ya da dikkatle çıkılabilecek dönemler",
                   icon=":material/sailing:")
    else:
        st.error("Seçilen dönemde en az 3 saat sürecek uygun bir pencere yok.", title="Uygun dönem yok",
                 icon=":material/do_not_disturb_on:")
with c2:
    if kotu.any():
        sayac = {"dalga": (s.dalga >= 2).sum(), "rüzgâr": (s.ruzgar >= 2).sum(), "görüş": (s.gorus >= 2).sum(),
                 "fırtına": (s.firtina >= 2).sum()}
        neden = max(sayac, key=sayac.get)
        st.warning(f"İlk riskli dönem **{deniz.pencereler(kotu, 1)[0][0]:%d.%m %H:%M}**. Dönemin en yüksek dalgası "
                   f"{d.wave_height.max():.1f} m ({zaman(d.wave_height.idxmax())}), en kuvvetli hamle "
                   f"{hava.wind_gusts_10m.reindex(d.index).max():.0f} km/s. Belirleyici etken çoğunlukla {neden}.",
                   title="Riskli saatler var", icon=":material/warning:")
    if s.kara_ruzgari.any():
        st.error(f"{deniz.pencereler(s.kara_ruzgari, 1)[0][0]:%d.%m %H:%M} itibarıyla rüzgâr **karadan denize** "
                 "esiyor. Kıyıda deniz sakin görünür ama açıldıkça rüzgâr ve dalga artar; motor arızasında tekne "
                 "açığa sürüklenir.", title="Kara rüzgârı", icon=":material/air:")

with st.expander("Eşikler nasıl belirlendi? Beaufort ve Douglas ölçekleri", icon=":material/menu_book:"):
    st.markdown("""
Değerlendirme **küçük tekneler** (yaklaşık 7 m altı, kayık, sandal, olta teknesi) içindir. Dört ölçütün en kötüsü
"Genel" satırına yazılır.

| Durum | Dalga (belirgin) | Hamle | Görüş | Karşılığı |
|---|---|---|---|---|
| :green-badge[Uygun] | < 0,5 m | < 25 km/s | > 4 km | Douglas 0–2 (sakin–hafif), Beaufort 0–4 |
| :yellow-badge[Dikkat] | 0,5–1 m | 25–38 km/s | 1–4 km | Douglas 3 (hafif dalgalı), Beaufort 5 |
| :orange-badge[Riskli] | 1–2 m | 38–50 km/s | < 1 km | Douglas 4 (dalgalı), Beaufort 6 |
| :red-badge[Tehlikeli] | > 2 m | > 50 km/s | — | Douglas 5+ (çok dalgalı), Beaufort 7+ ya da gök gürültülü fırtına |

**Kara rüzgârı:** Rüzgâr karadan denize doğru 20 km/s'ten kuvvetli esiyorsa durum en az "Dikkat" olur.
""")

# ---------------------------------------------------------------- balık
st.subheader("Balık için uygun zamanlar", anchor=False, divider="gray")
guvenli = s.genel <= 1
st.altair_chart(grafik.balik_grafigi(g, guvenli, gunluk), alt="Balıkçı göstergesi")
iyi = deniz.pencereler((g.toplam >= 50) & guvenli, en_az_saat=1)
iyi = sorted(iyi, key=lambda p: -g.toplam.loc[p[0]:p[1] - pd.Timedelta(hours=1)].mean())[:4]
if iyi:
    kol = st.columns(len(iyi))
    for c, (a, b) in zip(kol, sorted(iyi)):
        with c.container(border=True):
            parca = g.loc[a:b - pd.Timedelta(hours=1)]
            nedenler = [ad for ad, sutun in (("alacakaranlık", "alacakaranlik"), ("ay konumu", "ay_konumu"),
                                             ("basınç", "basinc"), ("hafif rüzgâr", "ruzgar")) if parca[sutun].max() >= 15]
            st.markdown(f"**{gun(a)}**  \n{a:%H:%M} – {b:%H:%M}")
            st.caption(f"Gösterge {parca.toplam.mean():.0f} · " + (", ".join(nedenler) or "birkaç küçük etken"))
else:
    st.info("Deniz koşullarının uygun olduğu saatlerde göstergenin 50'yi geçtiği bir dönem yok.",
            icon=":material/phishing:")

with st.expander("Bu gösterge nasıl hesaplanıyor? (Önce bunu oku)", icon=":material/science:"):
    st.markdown(f"""
Bu gösterge **balıkçıların yaygın gözlemlerine** dayanır; balık davranışını öngören, bilimsel olarak doğrulanmış bir
model **değildir**. Balığın yeri ve iştahı su sıcaklığına, akıntıya, mevsime, yeme ve türe göre çok değişir.
Göstergeyi "hangi saatleri denemeye değer?" sorusu için kaba bir rehber olarak kullan.

| Etken | En fazla | Gerekçe |
|---|---|---|
| Alacakaranlık | 30 | Gün doğumu ve batımına yakın saatlerde (±1,5 sa) ışık azalır, birçok tür yüzeye ve kıyıya yaklaşıp avlanır. Bu, bilimsel olarak da en iyi desteklenen etkendir. |
| Ay konumu (solunar) | 20 | Ayın tepede ya da ayak altında olduğu saatler "ana", doğuş/batış saatleri "ara" dönem kabul edilir. Kanıtı zayıftır; burada yaklaşık hesaplanır. |
| Ay evresi | 10 | Yeni ay ve dolunay civarında gelgit akıntıları güçlenir; Türkiye denizlerinde gelgit çok küçük olduğundan etkisi sınırlıdır. Bugün: {ay_simge} {ay_ad}. |
| Basınç eğilimi | 20 | Balıkçılar, cephe öncesi yavaş düşen basınçta avın arttığını, hızlı düşüşte ve cephe sonrası yükselişte azaldığını söyler. |
| Rüzgâr | 15 | Hafif rüzgâr yüzeyi kırıştırır, balık daha az ürker; kuvvetli rüzgâr oltayı ve tekneyi zorlar. |

Denize çıkmanın uygun olmadığı saatler **gri** gösterilir ve öneri listesine alınmaz.
""")

# ---------------------------------------------------------------- dalgalar
st.subheader("Dalgalar", anchor=False, divider="gray")
st.altair_chart(grafik.dalga_grafigi(d), alt="Dalga yüksekliği ve bileşenleri")
okuma_rehberi([
    ("Belirgin dalga yüksekliği", "Tahminlerdeki sayı en yüksek üçte bir dalganın ortalamasıdır; gözle tahmin "
     "edilen dalga boyuna yakındır. Ama **tek tek dalgalar bunun iki katına** çıkabilir: 1 m'lik denizde 2 m'lik "
     "dalga ile karşılaşmak olağandır. İpucunda \"olası en büyük tek dalga\" bu yüzden ayrıca verildi."),
    ("Periyot", "İki dalga tepesi arasındaki süre. Kısa periyot (4–5 sn altı) dik ve sert dalga demektir; aynı "
     "yükseklikte bile küçük tekneyi uzun periyotlu dalgadan çok daha fazla zorlar."),
    ("Rüzgâr dalgası ve soluğan", "Rüzgâr dalgası o anda esen rüzgârın ürettiği kısa, düzensiz dalgadır. **Soluğan** "
     "(swell) uzakta esmiş rüzgârın gönderdiği uzun, düzenli dalgadır; rüzgâr dinmiş olsa bile sürebilir. "
     "Sakin havada kıyıda beklenmedik dalga görmenin nedeni çoğu zaman soluğandır."),
    ("Oklar", "Dalgaların gittiği yönü gösterir. Dalganın geldiği yöne açık kıyılar ve limanlar en çok etkilenir."),
], baslik="Dalga grafiği nasıl okunur?")

# ---------------------------------------------------------------- su sıcaklığı ve deniz seviyesi
c1, c2 = st.columns(2, gap="large")
with c1:
    st.subheader("Su sıcaklığı", anchor=False)
    st.altair_chart(grafik.basit_seri(d.sea_surface_temperature, "Su sıcaklığı", "°C", "#E8590C"),
                    alt="Deniz suyu sıcaklığı")
    st.caption("Model, denizin en üst katmanının sıcaklığını verir. Balıklar türlerine göre belirli sıcaklık "
               "aralıklarını izler; sonbaharda sular soğudukça göç eden türler (ör. Karadeniz'de hamsi, "
               "palamut) kıyı boyunca yer değiştirir. Birkaç günde 1–2 °C'lik ani değişimler avı etkileyebilir.")
with c2:
    st.subheader("Deniz seviyesi", anchor=False)
    st.altair_chart(grafik.basit_seri(d.sea_level_height_msl, "Deniz seviyesi", "m", "#1C7ED6"),
                    alt="Deniz seviyesi")
    st.caption("Gelgit ve rüzgâr/basınç kaynaklı kabarmanın toplamı. Karadeniz ve Ege'de gelgit yalnızca birkaç "
               "santimetredir; seviyedeki değişimi daha çok kıyıya doğru esen rüzgâr ve düşük basınç yapar. Seviye "
               "yükseldiğinde alçak iskele ve kumsallar su altında kalabilir.")

st.caption(":material/emergency: Denize çıkmadan önce [MGM](https://www.mgm.gov.tr) deniz tahminlerine ve "
           "uyarılarına bak. Acil durumda Sahil Güvenlik: **158**, VHF **Kanal 16**. Av yasakları ve boy "
           "sınırları için Tarım ve Orman Bakanlığı'nın güncel su ürünleri tebliğine uy.")

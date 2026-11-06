import altair as alt
import pandas as pd
import streamlit as st

from hava import tasarim

tasarim.baslik("Öğren", "Bir hava tahmini nasıl okunur?",
               "Telefondaki tek bir simgenin arkasında ne olduğunu anlamak için kısa bir rehber.", "ogren")

st.subheader("5 adımda tahmin okumak", anchor=False)
adimlar = [
    (":material/notifications_active:", "Önce uyarılara bak",
     "Genel bakış sayfasındaki kartlar, tahmin verisinde eşik aşan olayları listeler. Kırmızı = tehlike, "
     "turuncu = dikkat, mavi = bilgi.", "app_pages/genel.py"),
    (":material/compress:", "Basıncın eğilimini izle",
     "Basınç düşüyorsa sistem yaklaşıyor, yükseliyorsa hava açıyor demektir. Değerden çok değişim hızı önemlidir.",
     "app_pages/meteogram.py"),
    (":material/compare_arrows:", "Modeller anlaşıyor mu?",
     "Farklı merkezlerin modelleri aynı şeyi söylüyorsa güven yüksektir. Ayrıştıkları tarihi not et.",
     "app_pages/modeller.py"),
    (":material/stacked_line_chart:", "Senaryolara bak",
     "Tek sayıya değil, senaryolara bak: 3–4 günden sonrası için ansambl bandı tek tahminden daha dürüsttür. \"%30 yağış\" yağmayacak demek değildir.",
     "app_pages/ansambl.py"),
    (":material/map:", "Büyük resmi haritada gör",
     "Sistemin nereden geldiğini ve ne hızla ilerlediğini görmek, zamanlamadaki hatayı tahmin etmeni sağlar.",
     "app_pages/haritalar.py"),
]
# Kompakt adımlar: numara + başlık; açıklama ve bağlantı tıklayınca açılan pencerede.
with st.container(key="adimlar", horizontal=True, gap="small"):
    for i, (ikon, baslik, metin, sayfa) in enumerate(adimlar, 1):
        with st.popover(f"{i} · {baslik}", icon=ikon, width="stretch"):
            st.markdown(f"**{ikon} {baslik}**")
            st.markdown(metin)
            st.page_link(sayfa, label="Bu sayfaya git", icon=":material/arrow_forward:")

st.subheader("Tahmin ne kadar ileriye güvenilir?", anchor=False)
sol, sag = st.columns([1.4, 1], gap="large")
with sol:
    # ECMWF'nin yayımladığı tipik başarı eğrisinin yaklaşık, öğretici bir gösterimi
    d = pd.DataFrame({"gun": range(1, 16),
                      "beceri": [98, 96, 93, 89, 84, 78, 71, 64, 56, 48, 41, 35, 30, 26, 23]})
    bolge = pd.DataFrame({"x0": [1, 4, 8, 11], "x1": [4, 8, 11, 15],
                          "ad": ["Güvenilir", "İyi", "Eğilim", "İklim ortalamasına yakın"]})
    st.altair_chart(alt.layer(
        alt.Chart(bolge).mark_rect(opacity=0.12).encode(
            x="x0:Q", x2="x1:Q", color=alt.Color("ad:N", title=None, legend=alt.Legend(orient="top"),
                                                 scale=alt.Scale(domain=list(bolge.ad),
                                                                 range=["#2F9E44", "#94D82D", "#FAB005", "#E03131"]))),
        alt.Chart(d).mark_line(point=True, strokeWidth=2.5, color="#1C7ED6").encode(
            alt.X("gun:Q", title="Kaç gün sonrası", scale=alt.Scale(domain=[1, 15])),
            alt.Y("beceri:Q", title="Tahmin becerisi (%)", scale=alt.Scale(domain=[0, 100])),
            tooltip=[alt.Tooltip("gun:Q", title="Gün"), alt.Tooltip("beceri:Q", title="Beceri %")]),
    ).properties(height=280), alt="Tahmin becerisinin gün sayısıyla azalması")
    st.caption("Temsili eğri: büyük ölçekli basınç düzeni için tipik beceri. Yağış ve yerel olaylarda beceri daha "
               "hızlı düşer.")
with sag:
    st.markdown("""
- **1–3 gün:** Sıcaklık ±1–2 °C, sistemlerin yeri ve zamanı oldukça kesin.
- **4–7 gün:** Genel durum doğru, ayrıntılar (yağışın saati, miktarı) kayabilir.
- **8–10 gün:** Yalnızca eğilim: "serinleşme", "yağışlı bir dönem".
- **10+ gün:** Tek tek günler için tahmin, mevsim normallerinden pek iyi değildir.

Atmosfer **kaotik** bir sistemdir: başlangıçtaki küçük ölçüm hataları her gün katlanarak büyür. Bu yüzden
modeller ne kadar iyileşirse iyileşsin hava tahmininin pratik sınırı yaklaşık iki haftadır.
""")

st.subheader("Sözlük", anchor=False)
sozluk = pd.DataFrame([
    ("Çiy noktası", "Havanın doyması için soğuması gereken sıcaklık. Sıcaklığa ne kadar yakınsa hava o kadar nemli.",
     "Nem konforunun en iyi ölçüsü: 10° kuru, 16° nemli, 20° bunaltıcı."),
    ("Hissedilen sıcaklık", "Rüzgâr ve nemin etkisiyle vücudun algıladığı sıcaklık.",
     "Kışın rüzgâr soğutur, yazın nem ısıtır."),
    ("Hamle", "Birkaç saniyelik en kuvvetli rüzgâr esintisi.", "Hasarı ortalama rüzgâr değil hamle verir."),
    ("İzobar", "Haritada eşit basınçlı noktaları birleştiren çizgi.", "Sıklaştıkça rüzgâr kuvvetlenir."),
    ("Alçak basınç (A)", "Çevresine göre basıncı düşük bölge; hava yükselir.", "Bulut, yağış, rüzgâr getirir."),
    ("Yüksek basınç (Y)", "Çevresine göre basıncı yüksek bölge; hava çöker.", "Açık, durgun hava; kışın sis ve don."),
    ("Cephe", "Farklı sıcaklıktaki iki hava kütlesinin sınırı.", "Geçerken rüzgâr döner, basınç dibe vurur, yağış olur."),
    ("Donma seviyesi", "Havanın 0 °C olduğu yükseklik.", "Yere 300–400 m yaklaşınca yağış kara döner."),
    ("850 hPa", "Yaklaşık 1,5 km yükseklik; hava kütlesinin \"gerçek\" sıcaklığı.", "−4 °C altı genellikle kar."),
    ("500 hPa", "Yaklaşık 5,5 km yükseklik; sistemleri yönlendiren akış.", "Oluk = kötü hava, sırt = iyi hava."),
    ("CAPE", "Yükselen havanın kazanabileceği enerji (J/kg).", "1000 üstü gök gürültülü sağanak potansiyeli."),
    ("CIN", "Yükselmeyi engelleyen enerji (\"kapak\").", "Kapak kırılırsa ani fırtınalar."),
    ("Ansambl", "Aynı modelin hafifçe farklı başlangıçlarla onlarca kez çalıştırılması.",
     "Yağış olasılığı buradan hesaplanır."),
    ("Yağış olasılığı", "Ansambl üyelerinin yüzde kaçının yağış verdiği.",
     "%30 = 10 senaryodan 3'ünde yağış var; \"yağmayacak\" demek değil."),
    ("WMO kodu", "Dünya Meteoroloji Örgütü'nün hava durumu kodları (0 açık … 99 dolulu fırtına).",
     "Uygulamadaki simgeler bu kodlardan gelir."),
], columns=["Terim", "Anlamı", "Pratikte"])
st.dataframe(sozluk, hide_index=True, alt="Meteoroloji terimleri sözlüğü",
             column_config={"Terim": st.column_config.TextColumn(width="small"),
                            "Anlamı": st.column_config.TextColumn(width="large"),
                            "Pratikte": st.column_config.TextColumn(width="medium")})

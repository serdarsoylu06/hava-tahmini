import streamlit as st

from hava.canli import UYDU_KATMAN, canli_harita
from hava.veri import konum

k = konum()
st.header("Canlı radar ve uydu", anchor=False)
st.caption("Gerçek gözlemler: son iki saatin yağış radarı ve Meteosat uydu görüntüsü, üstünde modelin şu anki rüzgâr "
           "akışı. Animasyon tarayıcında döner. Haritaya tıklarsan orası uygulamanın konumu olur.")

c1, c2 = st.columns([1.4, 1], vertical_alignment="bottom")
secili = c1.pills("Katmanlar", ["Radar", "Uydu", "Rüzgâr akışı"], selection_mode="multi",
                  default=["Radar", "Rüzgâr akışı"], key="canli_katman")
uydu_ad = c2.selectbox("Uydu görüntüsü", list(UYDU_KATMAN), key="canli_uydu", disabled="Uydu" not in secili)

tik = canli_harita(k, {"radar": "Radar" in secili, "uydu": "Uydu" in secili, "ruzgar": "Rüzgâr akışı" in secili},
                   UYDU_KATMAN[uydu_ad], koyu=st.context.theme.type == "dark")
if tik:
    st.session_state.harita_nokta = {"lat": round(tik["lat"], 3), "lon": round(tik["lon"], 3)}
    st.rerun()

sol, orta, sag = st.columns(3, gap="medium")
with sol.container(border=True, height="stretch"):
    st.markdown("**:material/radar: Radar neyi gösterir?**")
    st.markdown("""
Radar, gönderdiği sinyalin yağmur damlası ve kar tanelerinden **geri yansımasını** ölçer. Renk ne kadar sıcaksa
(sarı → kırmızı → mor) yağış o kadar yoğundur.

- **Hücre hâlinde, hızlı büyüyen kırmızı lekeler** gök gürültülü sağanaktır.
- **Geniş, düzgün mavi alanlar** cephesel, uzun süren yağıştır.
- Animasyonda yağışın **hangi yöne ve ne hızla** ilerlediğine bak: bir saat sonra nerede olacağını
  kendin kestirebilirsin (meteorologların "nowcasting" dediği şey budur).
""")
with orta.container(border=True, height="stretch"):
    st.markdown("**:material/satellite_alt: Uydu neyi gösterir?**")
    st.markdown("""
Meteosat, Ekvator üzerinde 36.000 km yükseklikten 15 dakikada bir görüntü alır.

- **Doğal renk** gündüz gözün göreceği gibidir; gece kızılötesine geçer.
- **Kızılötesinde** beyaz = soğuk = yüksek bulut tepesi. En parlak beyaz, kuleleşmiş fırtına bulutlarıdır.
- **Virgül biçimli bulut bantları** gelişmiş alçak basınç sistemleridir; kuyruğu soğuk cepheyi gösterir.
- Radarın göremediği yerleri (denizler, sınır ötesi) uydu görür; ama bulutun yağış verip vermediğini radar söyler.
""")
with sag.container(border=True, height="stretch"):
    st.markdown("**:material/air: Rüzgâr akışı neyi gösterir?**")
    st.markdown("""
Akan çizgiler **modelin** bu saat için hesapladığı 10 m rüzgârıdır (gözlem değil). Renk hızı gösterir.

- Akışın **döndüğü** yerler basınç merkezleridir: alçak basınç etrafında saat yönünün tersine dönüş.
- **İki akışın karşılaştığı** (yakınsadığı) hatlarda hava yükselir; radarda yağış bandını sık sık tam bu hatta
  görürsün.
- Dağların ve boğazların rüzgârı nasıl yönlendirdiğine bak.
""")

st.caption("Kaynaklar: radar [RainViewer](https://www.rainviewer.com) (gri gölgeli alanlarda radar kapsaması yok), uydu "
           "[EUMETSAT](https://view.eumetsat.int) Meteosat MTG (yaklaşık 30–45 dk gecikmeli), rüzgâr Open-Meteo "
           "modelleri, altlık harita © OpenStreetMap katkıcıları, © CARTO.")

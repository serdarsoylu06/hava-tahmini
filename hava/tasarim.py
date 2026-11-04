"""Görsel tasarım ("Alet paneli"): sade beyaz yüzeyler, ince çizgiler, tek vurgu rengi, sayılar eş aralıklı yazıyla.
Renkler ve yazı tipleri .streamlit/config.toml'da; burada yalnızca temanın veremediği kart, başlık, kahraman kartı ve
mobil düzen stilleri var. Seçiciler mümkün olduğunca bizim verdiğimiz anahtarlara (.st-key-…) bağlanır."""
import html
import re

import streamlit as st

MONO = "'IBM Plex Mono', ui-monospace, monospace"

# WMO hava kodu → Material Symbols simge adı (gündüz, gece)
_SIMGE = [((0,), "clear_day", "bedtime"), ((1, 2), "partly_cloudy_day", "partly_cloudy_night"),
          ((3,), "cloud", "cloud"), ((45, 48), "foggy", "foggy"), ((51, 53, 55, 56, 57), "rainy_light", "rainy_light"),
          ((61, 63, 66), "rainy", "rainy"), ((65, 67, 80, 81, 82), "rainy_heavy", "rainy_heavy"),
          ((71, 73, 75, 77, 85, 86), "weather_snowy", "weather_snowy"), ((95, 96, 99), "thunderstorm", "thunderstorm")]


def _renkler(koyu):
    if koyu:
        return {"yuzey": "#171B20", "cizgi": "#2A3038", "ince": "#20252C", "soluk": "#9BA4AE", "ikinci": "#C3CAD2",
                "vurgu": "#FB923C", "metin": "#E8EBEE", "golge": "0 1px 0 rgba(0,0,0,.4)"}
    return {"yuzey": "#FFFFFF", "cizgi": "#D9DDE2", "ince": "#EEF0F2", "soluk": "#5F6873", "ikinci": "#3D4651",
            "vurgu": "#C2410C", "metin": "#111418", "golge": "0 1px 0 rgba(17,20,24,.04)"}


def buyuk(s):
    """Türkçe büyük harf: i → İ, ı → I (CSS text-transform sayfa dili İngilizce olduğu için yanlış çevirir)."""
    return s.replace("i", "İ").replace("ı", "I").upper()


def _metin(s):
    """Güvenli HTML: önce kaçışla, sonra yalnızca **kalın** işaretini çevir."""
    return re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", html.escape(s))


def stil(koyu):
    r = _renkler(koyu)
    st.html(f"""<style>
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@48,300,0,0&display=block');

/* sayfa başlığı ve bölüm başlıkları */
.pb {{ background: {r['yuzey']}; border: 1px solid {r['cizgi']}; border-radius: 8px; box-shadow: {r['golge']};
       padding: clamp(16px, 2.6vw, 24px) clamp(18px, 3vw, 28px); }}
.pb-etiket, .bl-no, .k-etiket, .k-okuma-ad {{ font-family: {MONO}; letter-spacing: .1em; }}
.pb-etiket {{ font-size: 12px; color: {r['vurgu']}; font-weight: 500; }}
.pb h1 {{ font-weight: 600; margin: .3em 0 .25em; padding: 0; font-size: clamp(22px, 3vw, 30px); line-height: 1.2;
          letter-spacing: -.01em; color: {r['metin']}; }}
.pb p {{ margin: 0; max-width: 860px; color: {r['ikinci']}; font-size: clamp(13px, 1.5vw, 15px); line-height: 1.55; }}

.bl {{ display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 14px; border-bottom: 1px solid {r['cizgi']};
       padding-bottom: 10px; margin-top: 8px; }}
.bl-no {{ font-size: 13px; color: {r['vurgu']}; letter-spacing: 0; }}
.bl h2 {{ margin: 0; padding: 0; font-size: 21px; font-weight: 600; color: {r['metin']}; }}
.bl span.bl-ac {{ font-size: 13px; color: {r['soluk']}; }}

/* kahraman kartı: anlık durum */
.kahraman {{ background: {r['yuzey']}; border: 1px solid {r['cizgi']}; border-radius: 8px; box-shadow: {r['golge']};
             padding: clamp(18px, 3vw, 28px); color: {r['metin']}; }}
.k-etiket {{ font-size: 12px; color: {r['soluk']}; }}
.k-ust {{ display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-top: 12px; }}
.k-sicak {{ font-family: {MONO}; font-weight: 500; font-size: clamp(72px, 12vw, 112px); line-height: .9;
            letter-spacing: -.06em; }}
.k-durum {{ font-size: clamp(15px, 1.9vw, 18px); font-weight: 600; margin-top: 14px; }}
.k-durum span {{ font-weight: 400; color: {r['soluk']}; }}
.k-ikon {{ font-family: 'Material Symbols Outlined'; font-size: clamp(64px, 10vw, 96px); line-height: 1;
           color: {r['vurgu']}; font-variation-settings: 'wght' 300, 'opsz' 48; user-select: none; }}
.k-okuma {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(104px, 1fr)); gap: 1px; margin-top: 22px;
            background: {r['cizgi']}; border: 1px solid {r['cizgi']}; border-radius: 6px; overflow: hidden; }}
.k-okuma > div {{ padding: 10px 12px; background: {r['yuzey']}; min-width: 0; }}
.k-okuma-ad {{ font-size: 11px; white-space: nowrap; color: {r['soluk']}; }}
.k-okuma-deger {{ font-family: {MONO}; font-weight: 500; font-size: 16px; margin-top: 3px; white-space: nowrap; }}

/* metrik kartları: beyaz yüzey, ince çerçeve, eş aralıklı değer */
[data-testid="stMetric"] {{ background: {r['yuzey']} !important; border: 1px solid {r['cizgi']} !important;
                            border-radius: 8px !important; box-shadow: {r['golge']}; padding: 14px 16px !important; }}
[data-testid="stMetricLabel"] p {{ font-family: {MONO}; font-size: 11.5px !important; letter-spacing: .02em;
                                   color: {r['soluk']}; }}
[data-testid="stMetricValue"] {{ font-family: {MONO}; letter-spacing: -.04em; font-size: 1.3rem; }}
/* dar kartta değer kesilmesin ("1006 h…"), alt satıra geçsin */
[data-testid="stMetricValue"] > div, [data-testid="stMetricValue"] p {{
    white-space: normal !important; overflow: visible !important; text-overflow: clip !important;
    height: auto !important; line-height: 1.15 !important; }}
[data-testid="stMetricDelta"] {{ color: {r['ikinci']}; }}

/* metrik satırları: masaüstünde yan yana, telefonda ikişerli sarılır */
[class*="st-key-kartlar"] [data-testid="stHorizontalBlock"] {{ flex-wrap: wrap; gap: .6rem; }}
[class*="st-key-kartlar"] [data-testid="stColumn"] {{ flex: 1 1 120px !important; min-width: 112px !important; }}

/* üst arama çubuğu */
.st-key-ust_cubuk {{ background: {r['yuzey']}; border: 1px solid {r['cizgi']}; border-radius: 8px; padding: 8px 10px;
                     box-shadow: {r['golge']}; }}

/* uyarılar, açılır kutular, grafik kapları */
[data-testid="stAlertContainer"] {{ background: {r['yuzey']} !important; border: 1px solid {r['cizgi']};
                                    border-radius: 8px; color: {r['metin']}; }}
[data-testid="stExpander"] details {{ border-radius: 8px; background: {r['yuzey']}; }}
/* Grafik kabı yalnızca zemin ve çerçeve verir; yatay dolgu yok: Vega genişliği kaptan ölçer ve dolgu eklenirse
   sol eksen etiketleri kesilir ("um 06.11"). */
[data-testid="stVegaLiteChart"] {{ background: {r['yuzey']}; border: 1px solid {r['cizgi']}; border-radius: 8px;
                                   padding-top: 8px; overflow: hidden; }}
/* Streamlit grafik çizimine sayfanın zemin rengini veriyor; kartların içinde (özellikle koyu temada) ayrı bir koyu
   kutu gibi duruyordu. Çizim saydam olsun, altındaki kartın rengi görünsün. */
[data-testid="stVegaLiteChart"] svg.marks, [data-testid="stVegaLiteChart"] canvas,
[data-testid="stMetric"] svg.marks, [data-testid="stMetric"] canvas {{ background: transparent !important; }}

@media (max-width: 640px) {{
  [data-testid="stMetric"] {{ padding: 10px 12px !important; }}
  [data-testid="stMetricValue"] {{ font-size: 1.35rem !important; }}
  /* telefonda ikişerli; tek kalan kart da yarım genişlikte kalsın, satırı doldurmasın */
  [class*="st-key-kartlar"] [data-testid="stColumn"] {{ flex: 0 0 calc(50% - .3rem) !important; min-width: 0 !important; }}
}}
</style>""")


def baslik(etiket, metin, aciklama="", palet=None):
    """Sayfanın başlık paneli. `palet` eski gradyanlı tasarımdan kaldı; artık tek vurgu rengi kullanılıyor."""
    st.html(f"""<div class="pb">
  <div class="pb-etiket">{html.escape(buyuk(etiket))}</div>
  <h1>{html.escape(metin)}</h1>
  {f"<p>{_metin(aciklama)}</p>" if aciklama else ""}
</div>""")


def bolum(no, metin, aciklama=""):
    """Numaralı bölüm başlığı: "01  Nelere dikkat etmeli?  açıklama"."""
    st.html(f"""<div class="bl"><span class="bl-no">{html.escape(no)}</span><h2>{html.escape(metin)}</h2>
  {f'<span class="bl-ac">{_metin(aciklama)}</span>' if aciklama else ""}</div>""")


def simge_adi(kod, gunduz=True):
    """WMO koduna göre Material Symbols simge adı."""
    for kodlar, g, c in _SIMGE:
        if kod in kodlar:
            return g if gunduz else c
    return "help"


def kahraman(etiket, sicaklik, durum, ek, okumalar, kod, gunduz):
    """Anlık durum kartı. `okumalar`: [(ad, değer), …] — altta dört hücreli okuma şeridi."""
    hucreler = "".join(f'<div><div class="k-okuma-ad">{html.escape(buyuk(a))}</div>'
                       f'<div class="k-okuma-deger">{html.escape(d)}</div></div>' for a, d in okumalar)
    st.html(f"""<div class="kahraman">
  <div class="k-etiket">{html.escape(buyuk(etiket))}</div>
  <div class="k-ust">
    <div><div class="k-sicak">{sicaklik:.0f}°</div>
         <div class="k-durum">{html.escape(durum)} <span>· {html.escape(ek)}</span></div></div>
    <div class="k-ikon" role="img" aria-label="{html.escape(durum)}">{simge_adi(kod, gunduz)}</div>
  </div>
  <div class="k-okuma">{hucreler}</div>
</div>""")

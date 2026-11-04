"""Görsel tasarım: gradyanlı başlık bantları, havaya göre renk alan kahraman kartı, kart ve mobil düzen stilleri.
Renkler ve yazı tipleri .streamlit/config.toml'da; burada yalnızca temanın veremediği gradyan, gölge ve mobil
düzen var. Seçiciler mümkün olduğunca bizim verdiğimiz anahtarlara (.st-key-…) bağlanır."""
import html
import re

import streamlit as st

PALET = {
    "tahmin": ("#4C3DCB", "#1C7ED6"), "atmosfer": ("#0B7285", "#364FC7"), "deniz": ("#0C8599", "#1864AB"),
    "iklim": ("#F76707", "#C2255C", "#5F3DC4"), "ogren": ("#2B8A3E", "#0B7285"), "canli": ("#212F5C", "#6741D9"),
}


def _gradyan(renkler, aci=125):
    return f"linear-gradient({aci}deg, {', '.join(renkler)})"


def _metin(s):
    """Güvenli HTML: önce kaçışla, sonra yalnızca **kalın** işaretini çevir."""
    return re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", html.escape(s))


def stil(koyu):
    yuzey = "rgba(255,255,255,0.04)" if koyu else "rgba(255,255,255,0.75)"
    cizgi = "rgba(139,124,255,0.22)" if koyu else "rgba(91,75,219,0.16)"
    golge = "0 14px 30px -18px rgba(0,0,0,0.8)" if koyu else "0 14px 30px -18px rgba(76,61,203,0.45)"
    st.html(f"""<style>
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&display=swap');

/* gradyanlı bantlar (başlık ve kahraman kartı) */
.hb {{ position: relative; overflow: hidden; border-radius: 22px; color: #fff; background: var(--g);
       padding: clamp(16px, 3vw, 26px) clamp(18px, 3.5vw, 32px); box-shadow: 0 16px 36px -18px rgba(30,20,90,.55); }}
.hb::before, .hb::after {{ content: ""; position: absolute; border-radius: 50%; pointer-events: none; }}
.hb::before {{ width: 320px; height: 320px; right: -90px; top: -150px;
               background: radial-gradient(circle, rgba(255,255,255,.38), transparent 62%); }}
.hb::after {{ width: 260px; height: 260px; left: 32%; bottom: -170px;
              background: radial-gradient(circle, rgba(255,255,255,.22), transparent 62%); }}
.hb-etiket {{ font-size: 11.5px; letter-spacing: .14em; text-transform: uppercase; font-weight: 700; opacity: .85; }}
.hb h1 {{ font-family: 'Plus Jakarta Sans', Inter, sans-serif; font-weight: 800; color: #fff; margin: .2em 0 .25em;
          font-size: clamp(22px, 3.3vw, 34px); line-height: 1.15; letter-spacing: -.01em; padding: 0; }}
.hb p {{ margin: 0; max-width: 860px; opacity: .93; font-size: clamp(13px, 1.5vw, 15px); line-height: 1.55; }}

/* kahraman kartı */
.kahraman {{ display: grid; grid-template-columns: 1fr auto; gap: 6px 24px; align-items: end; }}
.k-yer {{ font-family: 'Plus Jakarta Sans', Inter, sans-serif; font-weight: 800; font-size: clamp(22px, 3.2vw, 32px);
          line-height: 1.1; }}
.k-alt {{ opacity: .85; font-size: 13px; margin-top: 2px; }}
.k-sicak {{ font-family: 'Plus Jakarta Sans', Inter, sans-serif; font-weight: 800; letter-spacing: -.05em;
            font-size: clamp(68px, 13vw, 124px); line-height: .95; margin-top: 10px; }}
.k-ikon {{ font-size: clamp(54px, 10vw, 96px); line-height: 1; filter: drop-shadow(0 8px 18px rgba(0,0,0,.25)); }}
.k-durum {{ font-size: clamp(15px, 1.9vw, 19px); font-weight: 600; margin-top: 4px; }}
.k-cipler {{ grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }}
.k-cipler span {{ background: rgba(255,255,255,.17); border: 1px solid rgba(255,255,255,.25); backdrop-filter: blur(6px);
                  border-radius: 999px; padding: 6px 12px; font-size: 13px; font-weight: 600; white-space: nowrap; }}

/* metrik kartları: hafif gradyan dolgu, yumuşak gölge */
[data-testid="stMetric"] {{ background: linear-gradient(150deg, {cizgi}, {yuzey}) !important;
                            border: 1px solid {cizgi} !important; border-radius: 18px !important;
                            transition: transform .15s ease, box-shadow .15s ease; }}
[data-testid="stMetric"]:hover {{ transform: translateY(-2px); box-shadow: {golge}; }}

/* metrik satırları: masaüstünde yan yana, telefonda ikişerli sarılır */
[class*="st-key-kartlar"] [data-testid="stHorizontalBlock"] {{ flex-wrap: wrap; gap: .65rem; }}
[class*="st-key-kartlar"] [data-testid="stColumn"] {{ flex: 1 1 120px !important; min-width: 112px !important; }}

/* üst arama çubuğu */
.st-key-ust_cubuk {{ background: linear-gradient(120deg, {cizgi}, {yuzey}); border: 1px solid {cizgi};
                     border-radius: 18px; padding: 10px 12px; }}

[data-testid="stAlert"] {{ border-radius: 16px; }}
[data-testid="stExpander"] details {{ border-radius: 14px; }}

@media (max-width: 640px) {{
  .hb {{ border-radius: 18px; }}
  .kahraman {{ grid-template-columns: 1fr auto; }}
  .k-cipler span {{ font-size: 12px; padding: 5px 10px; }}
  [data-testid="stMetric"] {{ padding: 10px 12px !important; }}
  [data-testid="stMetricValue"] {{ font-size: 1.35rem !important; }}
  /* telefonda ikişerli; tek kalan kart da yarım genişlikte kalsın, satırı doldurmasın */
  [class*="st-key-kartlar"] [data-testid="stColumn"] {{ flex: 0 0 calc(50% - .33rem) !important; min-width: 0 !important; }}
}}
</style>""")


def baslik(etiket, metin, aciklama="", palet="tahmin"):
    """Sayfanın gradyanlı başlık bandı."""
    st.html(f"""<div class="hb" style="--g: {_gradyan(PALET[palet])}">
  <div class="hb-etiket">{html.escape(etiket)}</div>
  <h1>{html.escape(metin)}</h1>
  {f"<p>{_metin(aciklama)}</p>" if aciklama else ""}
</div>""")


def hava_gradyani(kod, gunduz):
    """WMO koduna ve gündüz/geceye göre kahraman kartının rengi."""
    if not gunduz:
        return ("#0B1026", "#2B2F77", "#5B3CC4")
    if kod >= 95:
        return ("#1F2340", "#4B2C83", "#7B2CBF")
    if kod in (71, 73, 75, 77, 85, 86):
        return ("#5C7CFA", "#91A7FF", "#C5D0FF")
    if kod >= 51 or kod in (45, 48):
        return ("#23395B", "#3B5B92", "#5C7FB8")
    if kod >= 3:
        return ("#495A7A", "#6C7FA3", "#8FA3C7")
    return ("#1D6FD8", "#2F9BEA", "#5CC8F5")


def kahraman(yer, alt, sicaklik, simge, durum, cipler, kod, gunduz):
    st.html(f"""<div class="hb kahraman" style="--g: {_gradyan(hava_gradyani(kod, gunduz), 140)}">
  <div><div class="k-yer">{html.escape(yer)}</div><div class="k-alt">{html.escape(alt)}</div>
       <div class="k-sicak">{sicaklik:.0f}°</div><div class="k-durum">{html.escape(durum)}</div></div>
  <div class="k-ikon">{simge}</div>
  <div class="k-cipler">{"".join(f"<span>{html.escape(c)}</span>" for c in cipler)}</div>
</div>""")

"""Kayıtlı noktalar (sık gidilen av noktaları, yayla, kamp yeri…).

Her ziyaretçinin noktaları kendi tarayıcısında, bir çerezde saklanır: sunucuda ortak bir dosya yok, başkası
göremez ya da silemez, uygulama yeniden başlatılsa da kaybolmaz. Oturum boyunca liste st.session_state'te
tutulur; oturum açılırken çerezden okunur, her değişiklikten sonra küçük bir betik çerezi günceller.
"""
import json
from urllib.parse import unquote

import streamlit as st

CEREZ = "havalab_noktalar"
ANAHTAR = "kayitli_noktalar"
EN_FAZLA = 15          # çerez sınırı ~4 KB; nokta başına ~80 bayt
AD_UZUNLUK = 40


def _gecerli(n):
    try:
        return {"ad": str(n["ad"]).strip()[:AD_UZUNLUK], "lat": round(float(n["lat"]), 4),
                "lon": round(float(n["lon"]), 4)}
    except (KeyError, TypeError, ValueError):
        return None


def _cerezden():
    try:
        ham = st.context.cookies.get(CEREZ)
    except Exception:                     # test ortamı gibi çerezin olmadığı durumlar
        ham = None
    if not isinstance(ham, str) or not ham:
        return []
    try:
        veri = json.loads(unquote(ham))
    except ValueError:
        return []
    if not isinstance(veri, list):
        return []
    return [n for n in map(_gecerli, veri) if n and n["ad"]][:EN_FAZLA]


def oku():
    if ANAHTAR not in st.session_state:
        st.session_state[ANAHTAR] = _cerezden()
    return list(st.session_state[ANAHTAR])


def ekle(ad, lat, lon):
    """Aynı adlı nokta varsa günceller. Liste doluysa en eskisi düşer."""
    n = _gecerli({"ad": ad, "lat": lat, "lon": lon})
    if not n or not n["ad"]:
        return
    noktalar = [x for x in oku() if x["ad"] != n["ad"]] + [n]
    st.session_state[ANAHTAR] = noktalar[-EN_FAZLA:]
    st.session_state[ANAHTAR + "_degisti"] = True


def sil(ad):
    st.session_state[ANAHTAR] = [x for x in oku() if x["ad"] != ad]
    st.session_state[ANAHTAR + "_degisti"] = True


def cerez_yaz():
    """Güncel listeyi tarayıcı çerezine yazan betik. İçerik liste değişince değiştiği için betik yalnızca o zaman
    yeniden çalışır. Çerez bir yıl geçerli, yalnızca bu site için (SameSite=Lax). Bu oturumda hiçbir değişiklik
    yapılmadıysa yazılmaz: çerez okunamadığında var olan kayıtların boş listeyle ezilmesini önler."""
    if not st.session_state.get(ANAHTAR + "_degisti"):
        return
    veri = json.dumps(oku(), ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")
    st.html(f"""<script>
document.cookie = "{CEREZ}=" + encodeURIComponent(JSON.stringify({veri})) +
  "; path=/; max-age=31536000; SameSite=Lax" + (location.protocol === "https:" ? "; Secure" : "");
</script>""", unsafe_allow_javascript=True)

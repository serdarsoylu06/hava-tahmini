"""Tüm sayfaları örnek veriyle, farklı konumlarda çalıştırır ve hata olmadığını doğrular.
İnternete çıkmaz: test boyunca her ağ isteği bilerek başarısız kılınır; örnek mod gerçekten çevrimdışı mı, o da
böylece sınanır (radar ve uydu kare listeleri "alınamadı" durumuna düşer, sayfa yine çalışmalıdır).

Çalıştırma:   python tests/test_sayfalar.py        (ya da pytest kuruluysa: pytest tests/)
"""
import os
import sys
import time
from pathlib import Path
from unittest import mock

import requests
from streamlit.testing.v1 import AppTest

KOK = Path(__file__).resolve().parent.parent
UYGULAMA = str(KOK / "hava_lab.py")
SAYFALAR = ["genel", "meteogram", "modeller", "ansambl", "dogrulama", "iklim", "balikcilik", "canli", "haritalar",
            "profil", "ogren"]
KONUMLAR = {
    "Ankara (iç kesim)": {"yer": "Ankara"},
    "Tirebolu (kıyı)": {"yer": "Tirebolu, Giresun"},
    "Londra (yurt dışı)": {"yer": "Londra (London), Birleşik Krallık"},
    "Haritadan nokta (Karadeniz)": {"nokta": {"lat": 41.6, "lon": 36.2}},
}
os.environ["HAVA_ORNEK"] = "1"


def _ag_yok(*a, **k):
    raise requests.ConnectionError("test: örnek veri modunda ağa çıkılmamalı")


def calistir(sayfa, konum):
    at = AppTest.from_file(UYGULAMA, default_timeout=180)
    if "nokta" in konum:
        at.session_state["harita_nokta"] = konum["nokta"]
    at.run()
    if "yer" in konum:
        at.sidebar.selectbox(key="yer").set_value(konum["yer"]).run()
    if sayfa != "genel":
        at.switch_page(f"app_pages/{sayfa}.py").run()
    return at


def denetle(at):
    """Hata listesi: yakalanmamış istisnalar ve 'Veri alınamadı' türü kırmızı kutular."""
    sorun = [f"istisna: {e.value[:300]}" for e in at.exception]
    sorun += [f"hata kutusu: {e.value[:200]}" for e in at.error if "alınamadı" in e.value or "sınırı" in e.value]
    return sorun


def test_tum_sayfalar():
    hatalar = []
    with mock.patch("requests.get", _ag_yok):
        for konum_ad, konum in KONUMLAR.items():
            for sayfa in SAYFALAR:
                for s in denetle(calistir(sayfa, konum)):
                    hatalar.append(f"{konum_ad} / {sayfa}: {s}")
    assert not hatalar, "\n".join(hatalar)


if __name__ == "__main__":
    toplam, hatali = 0, 0
    with mock.patch("requests.get", _ag_yok):
        for konum_ad, konum in KONUMLAR.items():
            print(f"\n{konum_ad}")
            for sayfa in SAYFALAR:
                t = time.time()
                sorun = denetle(calistir(sayfa, konum))
                toplam += 1
                hatali += bool(sorun)
                print(f"  {'✗' if sorun else '✓'} {sayfa:<11} {time.time() - t:4.1f} sn", *sorun, sep="\n      " if sorun else "")
    print(f"\n{toplam - hatali}/{toplam} sayfa sorunsuz")
    sys.exit(1 if hatali else 0)

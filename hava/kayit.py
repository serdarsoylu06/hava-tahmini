"""Kayıtlı noktalar (sık gidilen av noktaları, yayla, kamp yeri…). Proje klasöründeki bir JSON dosyasında
saklanır; uygulama yeniden başlatılsa da kaybolmaz."""
import json
from pathlib import Path

DOSYA = Path(__file__).resolve().parent.parent / "kayitlar" / "noktalar.json"


def oku():
    try:
        return json.loads(DOSYA.read_text(encoding="utf-8"))
    except (FileNotFoundError, ValueError):
        return []


def _yaz(noktalar):
    DOSYA.parent.mkdir(exist_ok=True)
    DOSYA.write_text(json.dumps(noktalar, ensure_ascii=False, indent=1), encoding="utf-8")


def ekle(ad, lat, lon):
    """Aynı adlı nokta varsa günceller."""
    ad = ad.strip()
    noktalar = [n for n in oku() if n["ad"] != ad]
    noktalar.append({"ad": ad, "lat": round(float(lat), 4), "lon": round(float(lon), 4)})
    _yaz(noktalar)


def sil(ad):
    _yaz([n for n in oku() if n["ad"] != ad])

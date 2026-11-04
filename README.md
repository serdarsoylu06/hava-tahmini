# Hava Tahmini Laboratuvarı

Hava tahminini **okumayı öğreten**, etkileşimli bir Streamlit uygulaması. Tahmin verisi otomatik taranır ve
"nelere dikkat etmeli?" kartlarına dönüşür. Her grafiğin yanında neye bakılacağını anlatan bir rehber vardır.

## Sayfalar

| Bölüm | İçerik |
|---|---|
| Genel bakış | Anlık durum, otomatik uyarılar (don, fırtına, sis, kar, dalga…), 24 saat ve 10 gün |
| Tahmin | Meteogram, modellerin karşılaştırması, ansambl, tahmin doğrulaması ve model sıralaması (gerçek istasyon ölçümüyle), iklim ve geçmiş |
| Deniz | Balıkçılık ve deniz: saat saat denize çıkış durumu, dalga, su sıcaklığı |
| Atmosfer | Canlı radar ve uydu, tahmin haritaları, atmosfer profili (skew-T) |
| Öğren | Tahmin okuma rehberi ve sözlük |

## Çalıştırma

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
streamlit run hava_lab.py
```

Not defterleri (`01–03_*.ipynb`) için ayrıca `pip install -r requirements-defter.txt` (ecCodes sistem kütüphanesi
gerekir; macOS'ta `brew install eccodes`). Uygulamanın kendisi bunlara ihtiyaç duymaz.

macOS'ta python.org kurulumunda veri çekerken `CERTIFICATE_VERIFY_FAILED` hatası alırsan bir kez
`/Applications/Python 3.12/Install Certificates.command` dosyasını çalıştır.

**Örnek veri modu:** Kenar çubuğundaki "Örnek veri (çevrimdışı)" düğmesi ya da `HAVA_ORNEK=1 streamlit run hava_lab.py`.
Hiçbir veri servisine istek atmadan sentetik bir senaryo gösterir; geliştirirken ve istek sınırı dolduğunda kullanılır.

**Testler:** `python tests/test_sayfalar.py` bütün sayfaları örnek veriyle, dört farklı konumda çalıştırır
(ağ bağlantısı olmadan).

## Yayına alma (Streamlit Community Cloud)

1. <https://share.streamlit.io> adresinde GitHub hesabınla giriş yap.
2. **Create app** → bu depoyu, `main` dalını ve ana dosya olarak `hava_lab.py`'yi seç. İstersen adresi
   (`<ad>.streamlit.app`) burada belirle.
3. **Advanced settings** → Python **3.12** seç (paketler bu sürümle denendi) ve **Deploy**'a bas. Bağımlılıklar
   `requirements.txt`'ten kurulur; ilk kurulum birkaç dakika sürer. Gizli anahtar (secrets) gerekmez.
4. Sonrasında `main`'e her `git push` uygulamayı kendiliğinden günceller.

Depo gizliyse Streamlit'e GitHub erişim izni vermen gerekir. Uygulama herkese açık bir adres alır; istersen
**Share** menüsünden erişimi belirli e-posta adresleriyle sınırlayabilirsin.

**Bilinmesi gerekenler:**
- Bir süre kimse açmazsa uygulama uykuya geçer; ilk açılış bir dakika kadar sürebilir.
- Sunucunun diski kalıcı değildir: `.onbellek/` (yanıt önbelleği) ve `kayitlar/` (Noktalarım) her yeniden
  başlatmada silinir. Kayıtlı noktalar sunucudaki tek bir dosyada tutulduğu için uygulamayı açan herkes aynı
  listeyi görür ve değiştirebilir.

**Netlify neden olmaz?** Netlify statik siteler ve kısa ömürlü fonksiyonlar içindir. Streamlit ise sürekli açık
duran bir Python sunucusu ve WebSocket bağlantısı gerektirir.

**İstek sınırı:** Open-Meteo'nun ücretsiz kullanımında saatlik ve günlük sınır var. Uygulama yanıtları saat dilimine
göre sunucuda önbelleğe alır: aynı saatte aynı sayfayı açan herkes aynı veriyi kullanır, yani kullanıcı sayısı
arttıkça istek sayısı artmaz. Yoğun kullanımda kendi Open-Meteo sunucunu kurmak (açık kaynak, Docker) ya da
ücretli API anahtarı almak gerekir.

## Veri kaynakları

- Tahmin, ansambl, deniz, geçmiş tahminler ve ERA5 arşivi: [Open-Meteo](https://open-meteo.com) (CC BY 4.0)
- İstasyon ölçümleri: havalimanı METAR raporları, [NOAA Aviation Weather Center](https://aviationweather.gov) (son 7 gün)
  ve [Iowa Environmental Mesonet](https://mesonet.agron.iastate.edu) arşivi (model sıralaması için 90 gün)
- Radar: [RainViewer](https://www.rainviewer.com) · Uydu: [EUMETSAT](https://view.eumetsat.int) Meteosat
- Yer adları: [GeoNames](https://www.geonames.org) (CC BY 4.0) · Kıyı çizgileri ve sınırlar: Natural Earth
- Altlık haritalar: © OpenStreetMap katkıcıları, © CARTO

# HavaLabSS web (yeni arayüz)

Hava Tahmini Laboratuvarı'nın sunucusuz sürümü: React + TypeScript + Vite, hedef Cloudflare Pages.
Streamlit uygulamasından bağımsızdır; depo kökündeki `hava_lab.py`, `hava/` ve `app_pages/` bu klasörden
etkilenmez ve çalışmaya devam eder.

## Durum

| Aşama | Durum |
|---|---|
| 1. İskelet, test altyapısı, Python referans çıktıları | tamam |
| 2. Veri katmanı (tipler, istemci, dönem önbelleği, doğrulama, zaman, `?yer=`) | tamam |
| 3. Hesaplar (uyarılar, deniz, iklim, model sıralaması) | tamam |
| 4. Basit mod | tamam |
| 5. Uzman mod (harita, meteogram, modeller, ansambl) | tamam |
| 6. Kalan sayfalar (canlı, profil, doğrulama, iklim, deniz, öğren) ve deniz harita katmanları | tamam |
| 7. Cloudflare Pages test dağıtımı, eski–yeni karşılaştırması | — |

Basit mod çalışıyor: manzaralı anlık durum kartı, dört gösterge (yağış, rüzgâr, nem, basınç), 24 saatlik grafik,
uyarılar ve 10 günlük kartlar; açık ve koyu tema, telefon düzeni. Uzman mod harita merkezlidir: ECMWF, ICON ve GFS'nin kendi ızgara
çıktılarından çizilen altı katman (sıcaklık, yağış, hamle, bulut, 850 ve 500 hPa), izobarlar, rüzgâr okları, zaman
çizelgesi; seçili konum için meteogram, altı modelin karşılaştırması ve ansambl. Telefonda harita tam genişlikte,
analiz alttan açılan panelde.

## Çalıştırma

```bash
cd web-app
npm install
npm run dev      # http://localhost:5173/?yer=Ankara  (koordinatla: ?nokta=41.02,38.81 · mod: ?mod=basit|uzman)
npm test         # birim ve eşdeğerlik testleri
npm run build    # tip denetimi + dist/
```

Node 22 ya da 24 önerilir (vitest 25'i resmen desteklemiyor; çalışıyor ama uyarı verir).

## Yayın (Cloudflare Pages)

Uygulama yalnızca durağan dosyalardan oluşur; sunucu ya da Worker gerekmez. Cloudflare Pages sayfaya rozet, şerit
ya da reklam eklemez (Streamlit Community Cloud'daki alt rozet ve araç çubuğu burada yoktur).

Depo GitHub'a gönderildikten sonra, Cloudflare panelinde bir kez:

1. **Workers & Pages → Create → Pages → Connect to Git**; GitHub hesabını bağla ve `hava-tahmini` deposunu seç.
2. Ayarlar:

   | Ayar | Değer |
   |---|---|
   | Production branch | `yeni-arayuz` (ana dala birleştirilince `main`) |
   | Framework preset | None |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
   | Root directory (Advanced) | `web-app` |

3. **Save and Deploy**. İlk derleme 1–2 dakika sürer; adres `https://<proje-adı>.pages.dev` olur.

Sonrasında dala yapılan her `git push` kendiliğinden yeniden yayımlanır; başka dallar ve PR'lar ayrı bir önizleme
adresi alır.

- Node sürümü `web-app/.node-version` dosyasından okunur (24). Okunmazsa panelde ortam değişkeni olarak
  `NODE_VERSION=24` verilir.
- Derleme, yer listesini depo kökündeki `hava/yerlesimler.json` dosyasından kopyalar; Cloudflare deponun tamamını
  indirdiği için "Root directory" `web-app` olsa da bu çalışır.
- Önbellek ve güvenlik başlıkları `public/_headers` dosyasındadır.
- Ücretsiz planın sınırları (ayda 500 derleme, 20.000 dosya, dosya başına 25 MiB) bu uygulamanın çok üstündedir;
  ziyaretçi sayısına ve bant genişliğine sınır yoktur. Veri istekleri ziyaretçinin tarayıcısından doğrudan
  Open-Meteo'ya gider, Cloudflare kotasından yemez.
- Kendi alan adı: proje sayfasında **Custom domains → Set up a domain**.

### Tema

Varsayılan olarak cihazın açık/koyu ayarı izlenir. Üstteki düğme "cihaza uy → açık → koyu" arasında döner; elle
seçim tarayıcıda saklanır (`havalab_tema`) ve `<html data-tema>` ile uygulanır (`src/kabuk/tema.ts`, renkler
`src/stil.css`'in başında). `index.html`'deki küçük betik seçimi sayfa çizilmeden önce uygular.

### Telefonun ana ekranına ekleme

Yayındaki site iPhone'da Safari'den **Paylaş → Ana Ekrana Ekle**, Android'de Chrome'dan **Ana ekrana ekle** ile
kısayol olur: kendi simgesiyle durur, adres çubuğu olmadan tam ekran açılır. Bunu `index.html`'deki etiketler,
`public/manifest.webmanifest` ve `public/simge-*.png` sağlar (simgeler `araclar/simge_uret.py` ile üretilir).
Kısayol `/` adresini açar; uygulama o tarayıcıda son bakılan yeri hatırlayıp onunla açılır (`havalab_son`).
İnternet yokken açılmaz ve bildirim göndermez: hizmet işçisi (service worker) yoktur.

## Klasörler

- `src/veri/` — iki modun paylaştığı veri katmanı: `tipler.ts`, `istemci.ts` (önbellek, eski veriye düşme, hata
  türleri), `donem.ts` (saatlik veri dönemi), `depo.ts` (IndexedDB), `dogrula.ts`, `openMeteo.ts`.
- `src/ortak/` — `cografya.ts`, `zaman.ts`, `sayi.ts`, `dizi.ts` (pandas gibi davranan özetler), `hava.ts` (WMO
  kodları), `yerler.ts`, `url.ts` (`?yer=`).
- `src/sayfa/` — Uzman modun sayfaları (`Canli`, `Dogrulama`, `Iklim`, `Deniz`, `Ogren`) ve paylaştıkları parçalar
  (`ortak.tsx`: veri yükleme durumu, başlık, ölçüt kartı, okuma rehberi). Her sayfa ayrı parça olarak, açılınca iner.
- `src/hesap/` — Python'dan taşınan hesaplar: `yorum.ts` (uyarılar), `deniz.ts` (denize çıkış güvenliği, balıkçı
  göstergesi, ay, en yakın deniz), `iklim.ts` (1991–2020 normalleri, geçmiş), `siralama.ts` (model sıralaması).
- `referans/` — mevcut Python fonksiyonlarının çıktıları; TypeScript testleri bunlarla karşılaştırır.
- `src/basit/` — Basit modun ekranı: `Basit.tsx`, `Manzara.tsx`, `Olcer.tsx`, `Saatlik.tsx`, `Uyarilar.tsx`,
  `Gunler.tsx`, `metin.ts` (düz dille metinler).
- `src/uzman/` — Uzman mod: `Uzman.tsx` (düzen), `Harita.tsx` (MapLibre), `Lejant.tsx`, `AnalizPaneli.tsx` (grafikler),
  `katmanlar.ts` (modeller, ızgara dosyalarının adresleri, koşu bilgisi), `katmanMetinleri.ts` (Streamlit'teki
  katman açıklamalarından üretilir), `analiz.ts` (meteogram, model uyumu, ansambl hesapları).
- `src/kabuk/kayit.ts` — kayıtlı yerler (tarayıcının yerel deposunda; en çok 15). `src/grafik/` — HavaLabSS'in kendi çizelgesi
  (`Cizelge.tsx`: SVG çizim, imleç, ipucu, klavye, tablo görünümü; `olcek.ts`: eksen, konum ve eğri hesapları).
- `araclar/referans_uret.py` — referansları üretir; Python kodunu yalnızca çağırır, değiştirmez.
- `araclar/yerlesim_kopyala.mjs` — `../hava/yerlesimler.json`'u `public/` altına kopyalar (dev ve build öncesi).

## Eşdeğerlik testleri

Python tarafında bir formül değişirse referanslar yeniden üretilir, testler farkı gösterir:

```bash
.venv/bin/python web-app/araclar/referans_uret.py   # depo kökünden
cd web-app && npm test
```

## Streamlit sürümünden bilinçli farklar

- **Önbellek tarayıcıda.** Dönem mantığı aynı (saat başını 10 geçe yenilenir, Türkiye saatiyle), ama kayıtlar
  sunucu diskinde değil ziyaretçinin tarayıcısında (IndexedDB) durur. Open-Meteo sınırı IP başına olduğu için her
  ziyaretçi kendi kotasını kullanır.
- **Saat dilimi "auto" olan konumlar.** Streamlit "şu an"ı sunucunun saatinden alıyordu; burada tahmin yanıtındaki
  saat dilimi kullanılır, yani her zaman konumun kendi saati.
- **Bozuk yanıtlar.** JSON olmayan ya da eksik değişkenli yanıt önbelleğe yazılmaz ve arayüze ulaşmaz.
- **Model koşusu.** Koşu (başlangıç) zamanı `modelKosusu()` ile ayrı okunur; tablolardaki zamanlar yalnızca
  geçerlilik zamanıdır.

- **Bootstrap çekilişleri.** Model sıralamasının güven aralığı günleri rastgele yeniden örnekler. Python numpy'nin
  üretecini kullanır, burada sabit tohumlu başka bir üreteç var: hata ölçütleri (MAE, RMSE, sapma) birebir aynı,
  güven aralığının uçları çok az farklı çıkar. Hesabın kendisi, numpy'nin çekilişleri verilerek birebir sınanır.
- **Python'da hata veren iki durum burada hata vermez.** Arşivde hiç günü olmayan bir yıl için aylık yağış boş
  döner; CAPE verisi tümüyle eksikken fırtına kodu varsa uyarı saatsiz yazılır.

- **Koordinatlı konumlar adreste.** Cihaz konumu ve kayıtlı noktalar `?nokta=enlem,boylam` olarak adrese yazılır;
  Streamlit'te bu seçimler sayfa yenilenince kayboluyordu.
- **Kayıtlı yerler çerezde değil yerel depoda.** Sınırlar aynı (15 nokta, 40 karakter). Streamlit'te kaydedilmiş
  noktalar buraya taşınmaz (farklı adres, farklı depo).
- **Basit modda ansambl isteği yok.** "Belirsizlik artıyor" uyarısı ansambl verisi ister; Basit mod istek sayısını
  düşük tutmak için onu indirmez. Diğer 12 uyarı aynı eşiklerle çalışır. Deniz uyarıları deniz sayfasıyla gelecek.

## Harita verisi

Harita katmanları noktasal tahminlerden üretilmez: her katman, modelin kendi ızgara çıktısından çizilir (Open-Meteo'nun
herkese açık `data_spatial` dosyaları; tarayıcı yalnızca görünen bölgenin parçalarını indirir, API kotası harcanmaz).
Çizimi [`@openmeteo/weather-map-layer`](https://github.com/open-meteo/weather-map-layer) paketi yapar.

- **Koşu ve geçerlilik zamanı ayrıdır.** Zaman çubuğu geçerlilik zamanını (konumun yerel saatiyle) ve tahmin ufkunu
  ("+15 sa") gösterir; koşu zamanı ayrıca yazılır ("ECMWF IFS koşusu 14.11 12Z").
- **Model başına alan:** ECMWF `ecmwf_ifs025`, ICON `dwd_icon`, GFS yüzey için `ncep_gfs013`, basınç ve üst seviyeler
  için `ncep_gfs025`. Bir model bir değişkeni yayımlamıyorsa o katman seçilemez.
- **ICON'un renkli alanı birleşik alandan çizilir** (`dwd_icon_seamless`): Avrupa ve Türkiye üzerinde ICON-EU (≈7 km,
  120 saate kadar), Orta Avrupa'da ICON-D2 (≈2 km, 48 saate kadar), başka her yerde küresel ICON (≈13 km). Koşu ve
  zaman adımları küresel ICON'unkidir; izobarlar ve oklar küresel alandan gelir.
- **ECMWF'in 9 km'lik alanı isteğe bağlıdır** (`ecmwf_ifs`; "Ayrıntılı ızgara" kutusu, telefonda "9 km" düğmesi; seçim
  tarayıcıda saklanır, kapalı başlar). Yalnızca yüzey değişkenlerini içerir; üst seviyeler, izobarlar ve oklar 0,25°'lik
  alandan okunur. Dosyaları değişken başına yaklaşık on kat büyük: genel görünümde bir zaman adımı 0,25°'lik alanda
  yaklaşık 4 sn, 9 km'lik alanda 16–40 sn sürdü. Bu yüzden varsayılan değildir.
- **Renkler eşikler arasında yumuşak geçer** (`color_blend=true`); kapalıyken ızgara hücreleri köşeli bloklar gibi
  görünüyordu. Yan etkisi: yağış katmanında yağışsız yerlerin üstünde de hafif gri bir örtü olur. Renk cetveli de
  aynı geçişle çizilir.
- **Hız:** her zaman adımı ayrı bir dosyadır; ilk çizim bu bağlantıda 6–8 sn sürdü. Zaman çubuğu sürüklenirken
  istek atılmaz (280 ms beklenir). Otomatik oynatma bu yüzden yok.
- **Paket deneyseldir (0.3.2) ve GPL-2.0 lisanslıdır.** Depo bu yüzden GPL-2.0 ile lisanslandı; ayrıntı aşağıda,
  "Lisans" bölümünde.
- **Denenip bırakılan:** paket "cross-origin isolated" sayfalarda (COOP/COEP başlıkları) daha hızlı çalışacak şekilde
  tasarlanmış, ama bu başlıklarla çizim işçileri hata verdi; başlıklar kapalı.
- Streamlit'teki haritada basınç merkezleri (A/Y harfleri) vardı; paket bunu çizmiyor, izobarlardan okunur.
- Rüzgâr dosyalarda m/s'dir; cetvelde ve nokta değerinde km/s'e çevrilerek gösterilir.

## Uzman sayfaları

Uzman modda üstte bir sayfa şeridi durur; seçili sayfa adrese `?sayfa=` olarak yazılır (paylaşılabilir).

| Sayfa | Dosya | Streamlit karşılığı | Veri |
|---|---|---|---|
| Harita ve analiz | `src/uzman/` | haritalar, meteogram, modeller, ansambl | Open-Meteo ızgara dosyaları ve nokta tahminleri |
| Canlı | `src/sayfa/Canli.tsx`, `src/hesap/canli.ts` | canli | RainViewer radarı, EUMETSAT Meteosat (WMS), ECMWF rüzgâr okları |
| Profil | `src/sayfa/Profil.tsx`, `SkewT.tsx`, `src/hesap/profil.ts` | profil (skew-T) | Open-Meteo basınç seviyesi tahminleri |
| Doğrulama | `src/sayfa/Dogrulama.tsx`, `src/hesap/dogrulama.ts`, `olcum.ts`, `siralama.ts`, `iem.ts` | dogrulama | Open-Meteo geçmiş tahmin arşivi, IEM METAR arşivi |
| İklim | `src/sayfa/Iklim.tsx`, `src/hesap/iklim.ts` | iklim | ERA5 arşivi (ayda bir indirilir), tahmin servisi |
| Deniz | `src/sayfa/Deniz.tsx`, `src/hesap/deniz.ts` | balikcilik | Open-Meteo deniz servisi, tahmin servisi |
| Öğren | `src/sayfa/Ogren.tsx` | ogren | veri indirmez |

Bu sayfalarda Streamlit sürümünden bilinçli farklar:

- **İstasyon ölçümleri IEM'den gelir.** Streamlit'in kullandığı aviationweather.gov tarayıcıdan çağrılamıyor (CORS
  yok). Aynı METAR raporları Iowa Environmental Mesonet arşivinden alınır; Worker gerekmez. İstasyonların konumu ise
  depodaki `src/hesap/istasyonlar.json` dosyasından okunur (NOAA istasyon bilgisi; Türkiye ve yakın çevresi, 138
  meydan; `araclar/istasyon_listesi.py` ile yenilenir). IEM'in kendi Türkiye listesi kullanılmaz: bazı koordinatları
  yanlıştır (Ordu-Giresun ile Hakkari yer değiştirmiş). Rapor,
  tam saate en çok 15 dakika uzaksa o saate yazılır (`siralama.py`'deki kural); basınç inHg'den hPa'ya çevrilir
  (±0,2 hPa yuvarlama payı). Ayrıntı: `src/hesap/olcum.ts`.
- **IEM saniyede yaklaşık bir isteğe izin verir.** İstekler `src/hesap/iem.ts` içindeki kuyrukta sıraya girer,
  geri çevrilen (429) istek iki kez yeniden denenir. Yakın istasyonlar tek istekte sorulur.
- **Canlı sayfadaki rüzgâr, akış çizgisi değil oktur.** Streamlit sürümü rüzgâr akışını 2,5° aralıklı nokta
  tahminlerinden ara değerle üretiyordu. Burada nokta tahmininden alan üretilmez: oklar ECMWF'in ızgara dosyasından
  okunur.
- **Uydu karoları `image/vnd.jpeg-png` biçiminde istenir** (karo başına ~40 kB; PNG ~500 kB).
- **Deniz sayfasında** saat saat durum ızgarası ile etken ayrıntısı tek çizelgede birleşti; dalga grafiğindeki yön
  okları yerine yön ipucunda yazıyor. Dönem seçenekleri 3, 5 ve 7 gündür (deniz servisinin ufku).
- **Doğrulama sayfasında** model sıralaması grafiği ile tablosu tek tabloda birleşti (nokta ve %90 aralığı tablonun
  içinde çizilir).

## Deniz katmanları (harita)

Haritada, hava katmanlarının altında iki deniz katmanı vardır; Streamlit sürümünde karşılıkları yoktur.

| Katman | Değişken | Kaynak (seçili modele göre) |
|---|---|---|
| Dalga yüksekliği | `wave_height` | ECMWF → `ecmwf_wam025` · ICON → `dwd_gwam` · GFS → `ncep_gfswave016` (yoksa `ncep_gfswave025`) |
| Deniz suyu sıcaklığı | `sea_surface_temperature` | hep `meteofrance_sea_surface_temperature` (Mercator Océan) |

- Deniz katmanı seçilince yalnızca deniz alanlarının bilgisi indirilir; sol panelde ve zaman çubuğunda hava modelinin
  değil, katmanın gerçek kaynağının adı ve koşusu yazar.
- Su sıcaklığının zaman çizelgesi koşudan önce başlar (analiz günleri); ufuk bu adımlarda eksi gösterilir.
- DWD'nin Avrupa dalga modeli (`dwd_ewam`, 0,05°) kullanılmıyor: yalnızca Avrupa denizlerini kapsar.
- Su sıcaklığının renk cetveli paketin genel sıcaklık ölçeğidir (−80…40 °C); deniz için kaba kalır, birkaç derecelik
  farklar aynı renge düşer. Kesin değer için noktaya dokunulur.
- Dalga yönü okları yok: paket yalnızca rüzgâr bileşenlerinden ok üretiyor.

## Atmosfer profili ve MetPy

Streamlit sürümü skew-T'yi MetPy 1.7.1 ile hesaplayıp matplotlib ile resim olarak çizer. Burada hesaplar
`src/hesap/profil.ts` içinde MetPy'nin aynı adlı işlevlerinden birebir taşındı (aynı sabitler, aynı formüller, aynı
adım sırası); diyagram `src/sayfa/SkewT.tsx` içinde SVG olarak çizilir.

Eşdeğerlik `referans/profil.json` ile sınanır: `araclar/referans_uret.py`, 20 profili (kararlı, kararsız, kapaklı,
dağ, doymuş, kuru, sıcak burunlu ve rastgele) Streamlit'in kendi `hava/skewt.py` koduyla hesaplar. Ölçülen farklar:

| Büyüklük | Tolerans |
|---|---|
| Profil (basınç, sıcaklık, çiy noktası, rüzgâr), yağışa dönüşebilir su, donma seviyesi | 1e-9 |
| Bulut tabanı (LCL) basıncı ve sıcaklığı | 1e-7 hPa, 1e-8 °C |
| Yükselen parselin sıcaklığı | 0,001 °C |
| CAPE ve CIN, MetPy'nin parsel profiliyle | 1e-6 J/kg |
| CAPE ve CIN, kendi parsel profilimizle | 0,05 J/kg |

Tek sayısal fark nemli adyabatın çözümündedir: MetPy uyarlamalı LSODA kullanır, burada sabit 0,5 hPa adımlı
dördüncü derece Runge–Kutta kullanılır; parsel sıcaklığındaki 0,001 °C'lik pay buradan gelir.

Çizimde bilinçli farklar: sıcaklık ekseni Streamlit'teki gibi −40…40 °C'dir (tropikal profiller sağdan taşar);
değeri eksik olan basınç seviyesi profile alınmaz (MetPy'de sonuç NaN olurdu); zaman çizelgesindeki CAPE modelin
kendi çıktısıdır, yandaki CAPE ise profilden yeniden hesaplanır.

## Henüz taşınmayanlar

- **Kıyıya yakınlık denetimi** (`deniz.kiyida_mi`): Natural Earth kıyı çizgisi dosyası gerekir. Basit moddaki uyarı
  kartlarına deniz uyarıları bu yüzden eklenmiyor; Deniz sayfası en yakın deniz noktasını kendi arar.
- **Örnek veri modu** (`hava/ornek.py`): yalnızca Python referans testlerinde kullanılır.

## Veri kaynakları

- Tahmin, ansambl, deniz, geçmiş tahminler, ERA5 arşivi, ızgara dosyaları ve yer adı araması:
  [Open-Meteo](https://open-meteo.com) (CC BY 4.0, ticari olmayan kullanım)
- İstasyon ölçümleri (METAR): [Iowa Environmental Mesonet](https://mesonet.agron.iastate.edu)
- Radar: [RainViewer](https://www.rainviewer.com) · Uydu: [EUMETSAT](https://view.eumetsat.int) Meteosat
- Yer listesi: [GeoNames](https://www.geonames.org) (CC BY 4.0)
- Altlık haritalar: © OpenStreetMap katkıcıları, © CARTO

## Lisans

GPL-2.0 (yalnızca sürüm 2); tam metin depo kökündeki [LICENSE](../LICENSE) dosyasında. Yayımlanan sitenin alt
bilgisinde kaynak koduna bağlantı durur; küçültülmüş paketi dağıtırken kaynağı sunma koşulu böyle karşılanır.

Neden GPL: harita katmanlarını çizen `@openmeteo/weather-map-layer` GPL-2.0 lisanslı, onun kullandığı
`@openmeteo/file-reader` ve `@openmeteo/file-format-wasm` ise `GPL-2.0-only`. Uygulama bunlarla tek paket olarak
dağıtıldığı için bütünün lisansı GPL-2.0 olmak zorunda.

Pakete giren öteki kitaplıkların hepsi GPL-2.0 ile bağdaşan lisanslar taşır: React (MIT), MapLibre GL JS
(BSD-3-Clause) ve bunların küçük bağımlılıkları (MIT, ISC, BSD, Unlicense). Denetlemek için:
`npm ls --omit=dev --all` çıktısındaki paketlerin `license` alanına bakılır.

**Grafikler neden hazır kitaplıkla çizilmiyor:** ilk sürümde Apache ECharts kullanılıyordu. Özgür Yazılım Vakfı'nın
yorumuna göre Apache-2.0, GPL'in 2. sürümüyle bağdaşmaz; harita paketleri "yalnızca sürüm 2" dediği için ikisini aynı
uygulamada dağıtmak lisans çelişkisiydi. ECharts kaldırıldı, grafikleri `src/grafik/Cizelge.tsx` çiziyor (bağımlılığı
yok; yayımlanan paket de yaklaşık 570 kB küçüldü). Yeni bir bağımlılık eklerken lisansı GPL-2.0 ile bağdaşmalı:
MIT, BSD, ISC olur; Apache-2.0 ve GPL-3.0 olmaz.

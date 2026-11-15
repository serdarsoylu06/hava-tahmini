/** Grafik renklerinin koyu temadaki karşılıkları. Seriler açık kart zeminine göre seçilmiş koyu tonlarla tanımlanır
 * (Streamlit sürümündeki renkler); koyu temada grafik kartı da koyudur ve aynı tonlar zeminde kaybolur. Burada her
 * rengin aynı anlamı taşıyan açık tonu durur. Tabloda olmayan renk (ör. hesaplanan ara tonlar) olduğu gibi kalır. */
const KOYU_KARSILIK: Readonly<Record<string, string>> = {
  "#2E6B3A": "#8CD07A",   // yeşil
  "#2A6FB0": "#7FB2E5",   // mavi
  "#B2602A": "#F0A060",   // turuncu
  "#B5352B": "#FF8F7E",   // kırmızı
  "#1C2829": "#E8EFE6",   // mürekkep
  "#6B4FA0": "#B79CF0",   // mor
  "#A03A78": "#E58BC0",   // pembe
  "#1F8A66": "#5CC9A0",   // deniz yeşili
  "#6F7F76": "#9FB0A7",   // gri
  "#8A968E": "#6E7F77",   // soluk gri ("deniz uygun değil")
  "#B8860B": "#E3B341",   // sarı eşik
  "#C8621A": "#F0A060",   // turuncu eşik
  "#8A8F2A": "#C9CF5A",   // sarı-yeşil eşik
};

/** Bir serinin ekranda kullanılacak rengi: açık temada kendisi, koyu temada karşılığı. */
export function ekranRengi(renk: string, koyu: boolean): string {
  return koyu ? KOYU_KARSILIK[renk.toUpperCase()] ?? renk : renk;
}

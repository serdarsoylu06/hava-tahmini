/** Python'un `f"{x:.nf}"` biçimiyle aynı metni üretir.
 *
 * İkisi de sayının ikilik değerini tam olarak yuvarlar; tek fark tam ortadaki değerlerdedir: Python çift olana
 * yuvarlar (`f"{2.5:.0f}"` → "2"), `toFixed` büyük olana ("3"). Mevcut uygulamadaki yazılar ("6 km KD",
 * "41.12° K") birebir aynı çıksın diye bu durum ayrıca ele alınır. */
export function pyBicim(x: number, n = 0): string {
  if (Number.isNaN(x)) return "nan";
  if (!Number.isFinite(x)) return x > 0 ? "inf" : "-inf";
  const mutlak = Math.abs(x);
  // |x|·10ⁿ tam "tamsayı + 0,5" ise |x|·2ⁿ⁺¹ tek bir tamsayıdır (2 ile çarpmak kayıpsızdır, bu yüzden sınama kesindir)
  const t = mutlak * 2 ** (n + 1);
  let govde: string;
  if (Number.isInteger(t) && t % 2 === 1) {
    const alt = (t * 5 ** n - 1) / 2;                       // ortanın altındaki tamsayı
    govde = ((alt % 2 === 0 ? alt : alt + 1) / 10 ** n).toFixed(n);
  } else {
    govde = mutlak.toFixed(n);
  }
  return (x < 0 || Object.is(x, -0) ? "-" : "") + govde;
}

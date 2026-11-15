// Arama önerilerinin listesi Streamlit uygulamasıyla ortaktır (hava/yerlesimler.json, GeoNames CC BY 4.0).
// Tek kaynak orada kalsın diye dosya depoya ikinci kez eklenmez; derleme öncesi public/ altına kopyalanır.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const kok = dirname(dirname(fileURLToPath(import.meta.url)));
const kaynak = resolve(kok, "..", "hava", "yerlesimler.json");
const hedef = resolve(kok, "public", "yerlesimler.json");
mkdirSync(dirname(hedef), { recursive: true });
copyFileSync(kaynak, hedef);
console.log(`yerlesimler.json kopyalandı → ${hedef}`);

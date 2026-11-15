/** Testler için: Python'un ürettiği referans çıktıları okur (web-app/referans/*.json, araclar/referans_uret.py). */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const KOK = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function referans<T>(ad: string): T {
  return JSON.parse(readFileSync(resolve(KOK, "referans", `${ad}.json`), "utf-8")) as T;
}

/** Streamlit uygulamasıyla ortak yer listesi (hava/yerlesimler.json). */
export function yerlesimDosyasi<T>(): T {
  return JSON.parse(readFileSync(resolve(KOK, "..", "hava", "yerlesimler.json"), "utf-8")) as T;
}

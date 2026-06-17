#!/usr/bin/env node
/**
 * Export PPA host-work pages per year for the poetic-canon deck ribbon.
 *
 * Reads quotable_canon/exports/exposure_year_df.parquet and writes
 * decks/2026-06-poetic-canon/assets/ppa-pages-ribbon.json
 *
 * Usage (from slidedecks repo root, quotable-canon env active):
 *   node scripts/export-ppa-pages-ribbon.mjs
 *   node scripts/export-ppa-pages-ribbon.mjs /path/to/quotable_canon
 */

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const canonRoot = path.resolve(process.argv[2] ?? path.join(repoRoot, '..', 'quotable_canon'));
const parquetPath = path.join(canonRoot, 'exports', 'exposure_year_df.parquet');
const outPath = path.join(
	repoRoot,
	'decks/2026-06-poetic-canon/assets/ppa-pages-ribbon.json'
);

const py = `
import json, sys
import polars as pl

yr = pl.read_parquet(sys.argv[1]).sort("ppa_pub_year")
payload = {
    "meta": {
        "source": "quotable_canon/exports/exposure_year_df.parquet",
        "reference_pages_per_year": 15000,
        "highlight_from_year": 1850,
        "year_lo": int(yr["ppa_pub_year"].min()),
        "year_hi": int(yr["ppa_pub_year"].max()),
        "total_pages": int(yr["total_pages"].sum()),
    },
    "years": [
        {"year": int(r["ppa_pub_year"]), "pages": int(r["total_pages"])}
        for r in yr.iter_rows(named=True)
    ],
}
json_path, js_path = sys.argv[2], sys.argv[3]
with open(json_path, "w") as f:
    json.dump(payload, f, indent=2)
with open(js_path, "w") as f:
    f.write("window.PPA_PAGES_RIBBON = ")
    json.dump(payload, f)
    f.write(";\\n")
print(len(payload["years"]))
`;

const dataJsPath = path.join(
	repoRoot,
	'decks/2026-06-poetic-canon/assets/ppa-pages-ribbon-data.js'
);

const nYears = execFileSync('python', ['-c', py, parquetPath, outPath, dataJsPath], {
	encoding: 'utf8',
}).trim();

console.log(`Wrote ${outPath} and ${dataJsPath} (${nYears} years from ${parquetPath})`);

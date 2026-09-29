// S7a spike: fetch & verify the current production Firefox en->zh Bergamot model.
// Source of truth: https://storage.googleapis.com/moz-fx-translations-data--303e-prod-translations-data/db/models.json
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");
const https = require("https");

const BASE = "https://storage.googleapis.com/moz-fx-translations-data--303e-prod-translations-data";
const DIR = "models/en-zh/llmaat_finetune10M_qe8_f2_ByQcSxGXQRqGi-UTxYE43g/exported";
const OUT = path.join(__dirname, "models");

// Pinned from registry models.json (releaseStatus: "Release", architecture base-memory),
// fetched 2026-09-17. model uncompressedSize/hash come from the registry; others we record after.
const FILES = [
  { name: "model.enzh.intgemm.alphas.bin", gz: `${DIR}/model.enzh.intgemm.alphas.bin.gz`,
    expectSize: 43849787, expectSha256: "4e5accc141373565ddc8fa1565bceaa8d0c3482a82cab8131c719ebcc6c2157c" },
  { name: "lex.50.50.enzh.s2t.bin", gz: `${DIR}/lex.50.50.enzh.s2t.bin.gz` },
  { name: "srcvocab.enzh.spm", gz: `${DIR}/srcvocab.enzh.spm.gz` },
  { name: "trgvocab.enzh.spm", gz: `${DIR}/trgvocab.enzh.spm.gz` },
];

function get(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "s7a-spike" } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects < 5) {
        res.resume();
        return resolve(get(new URL(res.headers.location, url).href, redirects + 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode} for ${url}`)); }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
    }).on("error", reject);
  });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const manifest = {
    pair: "en->zh-Hans", architecture: "base-memory", releaseStatus: "Release",
    registry: `${BASE}/db/models.json`, fetchedAt: new Date().toISOString(),
    engine: "@browsermt/bergamot-translator@0.4.9 (MPL-2.0)", files: [],
  };
  for (const f of FILES) {
    process.stdout.write(`fetching ${f.name} ... `);
    const gzBuf = await get(`${BASE}/${f.gz}`);
    const buf = zlib.gunzipSync(gzBuf);
    const sha = crypto.createHash("sha256").update(buf).digest("hex");
    fs.writeFileSync(path.join(OUT, f.name), buf);
    const rec = { name: f.name, bytes: buf.length, gzBytes: gzBuf.length, sha256: sha, gzUrl: `${BASE}/${f.gz}` };
    if (f.expectSize) {
      if (buf.length !== f.expectSize) throw new Error(`${f.name}: size ${buf.length} != ${f.expectSize}`);
      if (sha !== f.expectSha256) throw new Error(`${f.name}: sha mismatch`);
      rec.verifiedAgainstRegistry = true;
    }
    manifest.files.push(rec);
    console.log(`${buf.length} B, sha ${sha.slice(0, 12)}…`);
  }
  fs.writeFileSync(path.join(__dirname, "model-manifest.json"), JSON.stringify(manifest, null, 2));
  const total = manifest.files.reduce((a, f) => a + f.bytes, 0);
  console.log(`TOTAL uncompressed ${total} bytes (${(total / 1048576).toFixed(1)} MiB)`);
})().catch((e) => { console.error("FETCH FAILED:", e); process.exit(1); });

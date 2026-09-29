// S15-1a：GLM response_format 真机探测（Electron 主进程内运行，safeStorage 解密 key）
// 用法：npx electron spike-v8/probe-response-format.cjs
const { app, safeStorage } = require("electron");
// 对齐正式应用的 userData（OSCrypt 主密钥存于该目录的 Local State），否则 safeStorage 解密失败
app.setPath("userData", require("node:path").join(__dirname, "..", "data", "webllm-profile"));
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const DATA = path.join(__dirname, "..", "data", "user.sqlite");
const RESULT = path.join(__dirname, "response-format-probe.json");

function log(s) { console.log("[probe]", s); }

async function postOnce(baseUrl, key, model, extra) {
  const t0 = Date.now();
  const resp = await fetch(baseUrl.replace(/\/+$/, "") + "/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
    body: JSON.stringify({
      model,
      stream: false,
      temperature: 0.1,
      max_tokens: 500,
      thinking: { type: "disabled" },
      messages: [
        { role: "system", content: "You are an English grammar checker. Return analysis as JSON." },
        { role: "user", content: "Analyze grammar: He go to school yesterday because he are late." },
      ],
      ...extra,
    }),
  });
  const text = await resp.text();
  let parsed = null, parseErr = null;
  try { parsed = JSON.parse(text); } catch (e) { parseErr = String(e.message); }
  return {
    status: resp.status,
    ms: Date.now() - t0,
    error_body: !resp.ok ? text.slice(0, 600) : undefined,
    content: resp.ok ? String(parsed?.choices?.[0]?.message?.content ?? "").slice(0, 1200) : undefined,
    raw_parse_err: parseErr,
  };
}

app.whenReady().then(async () => {
  const out = { at: new Date().toISOString(), cases: {} };
  try {
    const db = new DatabaseSync(DATA);
    const cipherRow = db.prepare("SELECT v FROM app_settings WHERE k='cloud_key_cipher'").get();
    const consentRow = db.prepare("SELECT v FROM app_settings WHERE k='cloud_consent_json'").get();
    db.close();
    if (!cipherRow || !cipherRow.v) throw new Error("no cloud key stored");
    const key = safeStorage.decryptString(Buffer.from(cipherRow.v, "base64"));
    const consent = JSON.parse(consentRow.v);
    const baseUrl = consent.baseUrl;
    const model = consent.model;
    log("baseUrl=" + baseUrl + " model=" + model + " keyLen=" + key.length);

    const cases = {
      baseline_no_format: {},
      json_object: { response_format: { type: "json_object" } },
      json_schema: {
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "grammar_analysis",
            strict: true,
            schema: {
              type: "object",
              properties: {
                score_est: { type: "number" },
                rewritten: { type: "string" },
                native_tip: { type: "string" },
                errors: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      quote: { type: "string" }, occurrence: { type: "number" },
                      type: { type: "string" }, correct: { type: "string" },
                      rule_zh: { type: "string" }, severity: { type: "string" },
                    },
                    required: ["quote", "occurrence", "type", "correct", "rule_zh", "severity"],
                  },
                },
              },
              required: ["score_est", "rewritten", "native_tip", "errors"],
            },
          },
        },
      },
    };

    for (const [name, extra] of Object.entries(cases)) {
      try {
        const r = await postOnce(baseUrl, key, model, extra);
        out.cases[name] = r;
        log(name + " -> " + r.status + " (" + r.ms + "ms)" + (r.error_body ? " ERR:" + r.error_body.slice(0, 200) : ""));
      } catch (e) {
        out.cases[name] = { exception: String(e?.message || e) };
        log(name + " EXC " + String(e?.message || e));
      }
      await new Promise((r) => setTimeout(r, 800));
    }
  } catch (e) {
    out.fatal = String(e?.stack || e);
    log("FATAL " + String(e?.stack || e));
  }
  require("node:fs").writeFileSync(RESULT, JSON.stringify(out, null, 2));
  log("written " + RESULT);
  app.quit();
});

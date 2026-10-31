const FILLER = /^(嗯|啊|哦|好的|那个|就是说|其实吧)[，,。.\s]*/;
const NUM_SPAN = /^\d[\d.,:/%-]*$/;

export function protectedSpans(text) {
  const s = new Set();
  for (const m of text.match(/\d[\d.,:/%-]*/g) || []) s.add(m);
  for (const m of text.match(/[「“"'][^」”"']{1,80}[」”"']/g) || []) s.add(m);
  for (const m of text.match(/https?:\/\/\S+|[\w.-]+@[\w.-]+/g) || []) s.add(m);
  for (const m of text.match(/.{0,2}(?:不|没|无|未|别|勿|禁止|不要|不能).{0,4}/g) || []) s.add(m.trim());
  return [...s].filter(Boolean);
}

function numberTokens(text) {
  return new Set(text.match(/\d[\d.,:/%-]*/g) || []);
}

export function ruleCompress(text) {
  let out = text.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  out = out.split("\n").map(l => l.replace(FILLER, "")).join("\n");
  const seen = new Set();
  out = out.split(/(?<=[。！？.!?])\s*|\n/).filter(s => {
    const k = s.trim();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  }).join("\n");
  return out.trim();
}

function bigrams(t) {
  const s = new Set();
  for (let i = 0; i < t.length - 1; i++) s.add(t.slice(i, i + 2));
  return s;
}

function coverage(a, b) {
  const A = bigrams(a), B = bigrams(b);
  if (A.size === 0) return 1;
  let h = 0;
  for (const g of A) if (B.has(g)) h++;
  return h / A.size;
}

export function verify(orig, comp, minCoverage) {
  if (!comp) return false;
  const origNums = numberTokens(orig);
  const compNums = numberTokens(comp);
  // 原文保护片段必须全部保留
  for (const s of protectedSpans(orig)) {
    if (NUM_SPAN.test(s)) {
      if (!compNums.has(s)) return false;
    } else if (!comp.includes(s)) {
      return false;
    }
  }
  // 压缩后不能出现原文没有的数字
  for (const n of compNums) {
    if (!origNums.has(n)) return false;
  }
  return coverage(orig, comp) >= minCoverage;
}

function extractiveTrim(text, maxChars) {
  const prot = protectedSpans(text);
  const sents = text.split(/(?<=[。！？.!?])\s*/).filter(Boolean);
  const scored = sents.map(s => ({
    s,
    must: prot.some(p => s.includes(p)),
    len: s.length,
  }));
  let out = scored.filter(x => x.must).map(x => x.s).join("");
  for (const x of scored.filter(x => !x.must).sort((a, b) => a.len - b.len)) {
    if (out.length + x.s.length > maxChars) break;
    out += x.s;
  }
  return out.trim();
}

export function compressMemory(text, { maxChars, minCoverage }) {
  if (text.length <= maxChars) {
    return { text, method: "none", verified: true };
  }
  const ruled = ruleCompress(text);
  if (ruled.length <= maxChars && verify(text, ruled, minCoverage)) {
    return { text: ruled, method: "rule", verified: true };
  }
  const base = ruled.length <= text.length ? ruled : text;
  const ext = extractiveTrim(base, maxChars);
  // must 句超预算时 compact 会超长，回退原文交给注入层截断
  if (ext.length <= maxChars * 1.2 && verify(text, ext, minCoverage)) {
    return { text: ext, method: "extractive", verified: true };
  }
  return { text, method: "none", verified: true, note: "rejected" };
}
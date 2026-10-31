// 中英混合粗略估算：CJK 约 1 字/token，其余约 4 字符/token
export function estimateTokens(text) {
  if (!text) return 0;
  let cjk = 0, other = 0;
  for (const ch of text) {
    if (/[\u3400-\u9FFF\uF900-\uFAFF]/.test(ch)) cjk++;
    else other++;
  }
  return Math.ceil(cjk + other / 4);
}

export function truncateByTokens(lines, budgetTokens) {
  const out = [];
  let used = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = estimateTokens(line) + 1;
    if (used + t <= budgetTokens) {
      out.push(line);
      used += t;
      continue;
    }
    // 第一行就超预算：截断这一行而不是返回空
    if (out.length === 0) {
      const keep = Math.max(10, Math.floor(line.length * (budgetTokens / t)));
      out.push(line.slice(0, keep) + "…");
    }
    break;
  }
  return out;
}
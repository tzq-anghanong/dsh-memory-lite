export function tokenize(text) {
  const t = text.toLowerCase();
  const s = new Set();
  for (let i = 0; i < t.length - 1; i++) s.add(t.slice(i, i + 2));
  return s;
}

function score(qt, entry) {
  const et = tokenize(`${entry.summary} ${(entry.tags || []).join(" ")}`);
  if (qt.size === 0 || et.size === 0) return 0;
  let hit = 0;
  for (const g of qt) if (et.has(g)) hit++;
  return hit / qt.size;
}

export function coarse(query, index, topK) {
  const qt = tokenize(query);
  const threshold = qt.size < 4 ? 1 : Math.max(2, Math.ceil(qt.size / 4));
  return index
    .map(e => ({ ...e, _score: score(qt, e) }))
    .filter(e => {
      if (e._score <= 0.05) return false;
      const approxHits = Math.round(e._score * qt.size);
      return approxHits >= threshold;
    })
    .sort((a, b) => b._score - a._score)
    .slice(0, topK);
}
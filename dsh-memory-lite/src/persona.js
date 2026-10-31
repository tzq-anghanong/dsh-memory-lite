import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { estimateTokens } from "./tokens.js";
import { log } from "./logger.js";

const MAX_SESSIONS = 64;

export class PersonaLayer {
  constructor(dir) {
    this.file = path.join(dir.replace("~", os.homedir()), "persona.json");
    this._cache = new Map();
    this._writeChain = Promise.resolve();
  }

  async load() {
    try {
      const d = JSON.parse(await fs.readFile(this.file, "utf8"));
      return Array.isArray(d.items) ? d.items : [];
    } catch (e) {
      if (e.code !== "ENOENT") log.warn("persona load failed:", e.message);
      return [];
    }
  }

  add(text) {
    const run = () => this._add(text);
    const p = this._writeChain.then(run, run);
    this._writeChain = p.then(() => {}, () => {});
    return p;
  }

  async _add(text) {
    const items = await this.load();
    if (items.some(i => i.text === text)) return items;
    items.push({ text, createdAt: new Date().toISOString() });
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    try {
      await fs.writeFile(tmp, JSON.stringify({ items }, null, 2));
      await fs.rename(tmp, this.file);
    } catch (e) {
      try { await fs.unlink(tmp); } catch { /* 忽略清理失败 */ }
      throw e;
    }
    this.invalidate();
    return items;
  }

  invalidate() {
    this._cache.clear();
  }

  // 有 sessionId 时缓存，避免跨会话串用
  async render(sessionId, budgetTokens) {
    if (this._cache.has(sessionId)) {
      const v = this._cache.get(sessionId);
      // LRU：命中后移到队尾
      this._cache.delete(sessionId);
      this._cache.set(sessionId, v);
      return v;
    }
    const text = await this.renderOnce(budgetTokens);
    if (this._cache.size >= MAX_SESSIONS) {
      this._cache.delete(this._cache.keys().next().value);
    }
    this._cache.set(sessionId, text);
    return text;
  }

  // 无 sessionId 时不缓存
  async renderOnce(budgetTokens) {
    const items = await this.load();
    const lines = [];
    let used = 0;
    for (const i of items) {
      const line = `- ${i.text}`;
      const t = estimateTokens(line) + 1;
      if (used + t > budgetTokens) break;
      lines.push(line);
      used += t;
    }
    return lines.join("\n");
  }
}
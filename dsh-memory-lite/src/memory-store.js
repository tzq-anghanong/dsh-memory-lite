import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { compressMemory } from "./compress.js";
import { log } from "./logger.js";

export class MemoryStore {
  constructor(dir, compressOpts) {
    this.root = dir.replace("~", os.homedir());
    this.chunkDir = path.join(this.root, "chunks");
    this.indexFile = path.join(this.root, "index.jsonl");
    this.compressOpts = compressOpts;
    this._writeChain = Promise.resolve();
    this._idxCache = null;
    this._idxMtime = 0;
    this._idxSize = -1;
  }

  async ensure() {
    await fs.mkdir(this.chunkDir, { recursive: true });
  }

  save(args) {
    const run = () => this._save(args.content, args.tags ?? [], args.source ?? "chat");
    const p = this._writeChain.then(run, run);
    this._writeChain = p.then(() => {}, () => {});
    return p;
  }

  async _save(content, tags, source) {
    await this.ensure();
    const id = `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const createdAt = new Date().toISOString();
    const compact = compressMemory(content, this.compressOpts);

    const chunk = {
      id,
      content: content.trim(),
      compact: compact.text,
      compactMeta: { method: compact.method, verified: compact.verified },
      tags,
      source,
      createdAt,
    };
    const chunkPath = path.join(this.chunkDir, `${id}.json`);
    await fs.writeFile(`${chunkPath}.tmp`, JSON.stringify(chunk, null, 2));
    await fs.rename(`${chunkPath}.tmp`, chunkPath);

    try {
      await fs.appendFile(
        this.indexFile,
        JSON.stringify({ id, summary: compact.text, tags, createdAt }) + "\n"
      );
    } catch (e) {
      // index 写入失败：删除 chunk 回滚，避免孤儿文件
      try { await fs.unlink(chunkPath); } catch { /* 忽略 */ }
      throw e;
    }
    this._idxCache = null;
    return chunk;
  }

  async loadIndex() {
    let st;
    try { st = await fs.stat(this.indexFile); }
    catch (e) {
      if (e.code === "ENOENT") return [];
      log.warn("index stat failed:", e.message);
      return [];
    }
    if (this._idxCache && this._idxMtime === st.mtimeMs && this._idxSize === st.size) {
      return this._idxCache;
    }
    const raw = await fs.readFile(this.indexFile, "utf8");
    const out = [];
    let corrupt = 0;
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try { out.push(JSON.parse(line)); }
      catch { corrupt++; }
    }
    if (corrupt) log.warn(`skip ${corrupt} corrupt index line(s)`);
    if (out.length > 10000) {
      log.warn(`index has ${out.length} entries; consider migrating to SQLite FTS5`);
    }
    this._idxCache = out;
    this._idxMtime = st.mtimeMs;
    this._idxSize = st.size;
    return out;
  }

  async expand(ids) {
    const out = [];
    for (const id of ids) {
      try {
        out.push(JSON.parse(await fs.readFile(path.join(this.chunkDir, `${id}.json`), "utf8")));
      } catch (e) {
        if (e.code !== "ENOENT") log.warn(`chunk ${id} read failed:`, e.message);
      }
    }
    return out;
  }
}
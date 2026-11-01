import { normalizeConfig } from "./config.js";
import { PersonaLayer } from "./persona.js";
import { MemoryStore } from "./memory-store.js";
import { coarse } from "./retriever.js";
import { truncateByTokens } from "./tokens.js";
import { log } from "./logger.js";

let ctx = null;

function sameCoreConfig(a, b) {
  return (
    a.personaTokens === b.personaTokens &&
    a.memoryTokens === b.memoryTokens &&
    a.coarseTopK === b.coarseTopK &&
    a.expandTopK === b.expandTopK &&
    a.minCoverage === b.minCoverage &&
    a.compressMaxChars === b.compressMaxChars
  );
}

function compressOptsOf(cfg) {
  return {
    maxChars: cfg.compressMaxChars,
    minCoverage: cfg.minCoverage,
  };
}

function ensureCtx(rawConfig) {
  const cfg = normalizeConfig(rawConfig);

  if (!ctx || ctx.cfg.memoryDir !== cfg.memoryDir) {
    if (ctx) log.warn("memoryDir changed at runtime; rebuilding store");
    ctx = {
      cfg,
      persona: new PersonaLayer(cfg.memoryDir),
      store: new MemoryStore(cfg.memoryDir, compressOptsOf(cfg)),
    };
    return ctx;
  }

  if (!sameCoreConfig(ctx.cfg, cfg)) {
    ctx.cfg = cfg;
    ctx.store.compressOpts = compressOptsOf(cfg);
    ctx.persona.invalidate();
  }
  return ctx;
}

async function computeMemoryBlock(store, query, cfg) {
  const index = await store.loadIndex();
  if (!index.length) return "";
  const short = coarse(query, index, cfg.coarseTopK);
  if (!short.length) return "";
  const chunks = await store.expand(short.slice(0, cfg.expandTopK).map(e => e.id));
  const lines = chunks.map(c => `- (${c.createdAt.slice(0, 10)}) ${c.compact || c.content}`);
  return truncateByTokens(lines, cfg.memoryTokens).join("\n");
}

export default {
  name: "dsh-memory-lite",

  async onPreStep({ messages, config, sessionId }) {
    const c = ensureCtx(config);
    const lastUser = [...(messages ?? [])].reverse().find(m => m.role === "user");
    if (!lastUser?.content) return {};

    // persona：有 sessionId 才缓存；无 sessionId 每次重算，避免串会话
    const pBlock = sessionId
      ? await c.persona.render(sessionId, c.cfg.personaTokens)
      : await c.persona.renderOnce(c.cfg.personaTokens);

    // memory：每轮按当前 query 计算，有命中就注入、无命中就不注入
    const mBlock = await computeMemoryBlock(c.store, lastUser.content, c.cfg);

    const parts = [];
    if (pBlock) parts.push(`<persona>\n${pBlock}\n</persona>`);
    if (mBlock) parts.push(`<memory>\n${mBlock}\n</memory>`);
    return parts.length ? { systemAppend: parts.join("\n\n") } : {};
  },

  async onPostStep({ messages, config }) {
    const c = ensureCtx(config);
    const u = [...(messages ?? [])].reverse().find(m => m.role === "user");
    if (!u?.content) return;
    const t = u.content;
    if (!/(记住|记一下|不要忘记|以后都)/.test(t)) return;

    if (/(风格|语气|称呼|回答要|说话)/.test(t)) {
      await c.persona.add(t.trim());
    } else {
      await c.store.save({ content: t, tags: ["auto"], source: "chat" });
    }
  },
};
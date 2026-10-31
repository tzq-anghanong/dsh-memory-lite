import plugin from "../src/index.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function main() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "dsh-mem-"));
  const config = { memoryDir: dir };

  console.log("=== Round 1: 记住偏好 ===");
  const m1 = [{ role: "user", content: "记住我的项目截止时间是周五" }];
  await plugin.onPostStep({ messages: m1, config });
  console.log((await plugin.onPreStep({ messages: m1, config, sessionId: "s1" })).systemAppend);

  console.log("\n=== Round 2: 换话题，不应命中 ===");
  const m2 = [...m1, { role: "assistant", content: "好的" }, { role: "user", content: "今天天气如何" }];
  console.log("result:", await plugin.onPreStep({ messages: m2, config, sessionId: "s1" }));

  console.log("\n=== Round 3: 换回话题，应命中 ===");
  const m3 = [...m2, { role: "assistant", content: "晴天" }, { role: "user", content: "截止时间还记得吗" }];
  console.log((await plugin.onPreStep({ messages: m3, config, sessionId: "s1" })).systemAppend);

  await fs.rm(dir, { recursive: true, force: true });
}

main().catch(console.error);
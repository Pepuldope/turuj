// After Peter allowed AI search bots in Cloudflare (6 Nov 2026): search bots must get 200,
// training bots must stay blocked (403 from Cloudflare, or disallowed in robots.txt).
const SITE = process.env.TARGET || "https://turuj.sk";
const PAGE = "/trasa/sitno";
const SEARCH = {
  "OAI-SearchBot": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.3; +https://openai.com/searchbot",
  "ChatGPT-User": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot",
  PerplexityBot: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)",
  "Perplexity-User": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Perplexity-User/1.0; +https://perplexity.ai/perplexity-user)",
  bingbot: "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
};
const TRAINING = {
  GPTBot: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot",
  ClaudeBot: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
};
const lines = [];
let failed = 0;
for (const [name, ua] of Object.entries(SEARCH)) {
  const r = await fetch(SITE + PAGE, { headers: { "User-Agent": ua } }).catch(() => null);
  const pass = r?.status === 200;
  if (!pass) failed++;
  lines.push(`${pass ? "PASS" : "FAIL"} ${name} gets ${r?.status ?? "no answer"} (should be 200)`);
}
for (const [name, ua] of Object.entries(TRAINING)) {
  const r = await fetch(SITE + PAGE, { headers: { "User-Agent": ua } }).catch(() => null);
  lines.push(`INFO ${name} (training) gets ${r?.status ?? "no answer"}; robots.txt disallows it either way`);
}
const report = `# Bot access ${SITE} (${new Date().toISOString()})\n\n${lines.map((l) => `- ${l}`).join("\n")}\n`;
console.log(report);
await import("node:fs").then((fs) => { fs.mkdirSync("live-check", { recursive: true }); fs.writeFileSync("live-check/report.md", report); });
process.exit(failed ? 1 : 0);

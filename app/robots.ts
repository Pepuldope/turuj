import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";

const TRAINING_CRAWLERS = ["Meta-ExternalAgent", "ClaudeBot", "GPTBot", "CCBot", "Google-CloudVertexBot", "Applebot-Extended", "Bytespider"];

export default function robots(): MetadataRoute.Robots {
  return {
    // Route comparisons (/trasa/<slug>/cesty) are drawn on their first visit and kept in KV, which
    // takes 1,000 writes a day: a crawler walking thousands of them would spend that and the CPU.
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/ulozene", "/trasa/*/cesty", "/en/ulozene", "/en/trasa/*/cesty"],
        // G12: Cloudflare's Content Signals, passed through verbatim: search and AI answers yes, model training no.
        other: { "Content-Signal": "search=yes, ai-input=yes, ai-train=no" },
      },
      // AI training crawlers: about half of all requests and most errors, no visitors (Peter, 2026-10-28).
      // Search engines and AI search (ChatGPT-User, OAI-SearchBot, PerplexityBot, Applebot) stay allowed.
      { userAgent: TRAINING_CRAWLERS, disallow: "/" },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}

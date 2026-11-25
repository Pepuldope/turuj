"use client";

import type { ReactNode } from "react";
import { SiteFooter } from "@/components/SiteFooter";
import { Here, PageBackLink } from "@/components/CameFrom";
import { useT } from "@/lib/i18n";

/** Plain text page (privacy, disclaimer, sources). */
export function InfoPage({ title, intro, children }: { title: ReactNode; intro?: ReactNode; children: ReactNode }) {
  const t = useT();
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <PageBackLink />
        {typeof title === "string" && <Here label={t(title)} />}
      </div>
      <header className="flex flex-col gap-1">
        <h1 className="text-[1.65rem] leading-tight font-extrabold">{typeof title === "string" ? t(title) : title}</h1>
        {intro && <p className="text-sm text-[var(--muted)]">{typeof intro === "string" ? t(intro) : intro}</p>}
      </header>
      <div className="flex flex-col gap-4 text-sm leading-relaxed [&_a]:text-[var(--accent)] [&_a]:underline [&_h2]:pt-2 [&_h2]:text-base [&_h2]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mt-1">
        {children}
      </div>
      <SiteFooter />
    </main>
  );
}

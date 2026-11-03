import { Fragment } from "react";
import type { ReactNode } from "react";
import { LangLink } from "@/lib/i18n";
import { LEGAL_FACTS } from "@/lib/legal";

// A small Markdown for the terms, privacy and closure texts (content/): "### " and "#### " headings, paragraphs,
// "- " lists, "| a | b |" tables (second row is the separator), **bold**, `code`, [text](href).
// A line "{{NAME}}" on its own is replaced by blocks[NAME]; "{{NAME}}" inside text by LEGAL_FACTS.

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${key}-${i++}`;
    if (m[1] !== undefined) out.push(<strong key={k}>{inline(m[1], k)}</strong>);
    else if (m[2] !== undefined) out.push(<code key={k}>{m[2]}</code>);
    else if (m[4].startsWith("/")) out.push(<LangLink key={k} href={m[4]}>{m[3]}</LangLink>);
    else out.push(<a key={k} href={m[4]}>{m[3]}</a>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function fillFacts(text: string): string {
  return text.replace(/\{\{(\w+)\}\}/g, (all, name: string) => LEGAL_FACTS[name] ?? all);
}

/** "13. Vaše práva" -> "b13"; "Výnimky a osobitné pravidlá" -> "vynimky" (links like /uzavery/tanap#vynimky). */
function anchor(heading: string): string {
  const num = heading.match(/^(\d+)\./);
  if (num) return `b${num[1]}`;
  return heading.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)[0] ?? "";
}

const cells = (row: string) => row.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

export function LegalText({ text, blocks = {} }: { text: string; blocks?: Record<string, ReactNode> }) {
  const out: ReactNode[] = [];
  const parts = text.split(/\n\s*\n/);
  parts.forEach((raw, n) => {
    const part = raw.trim();
    const key = `b${n}`;
    const only = part.match(/^\{\{(\w+)\}\}$/);
    if (only && blocks[only[1]] !== undefined) return void out.push(<Fragment key={key}>{blocks[only[1]]}</Fragment>);
    const body = fillFacts(part);
    if (body.startsWith("#### ")) return void out.push(<h3 key={key} className="pt-1 font-semibold">{inline(body.slice(5), key)}</h3>);
    if (body.startsWith("### ")) return void out.push(<h2 key={key} id={anchor(body.slice(4))}>{inline(body.slice(4), key)}</h2>);
    const lines = body.split("\n");
    if (lines.every((l) => l.startsWith("|"))) {
      const [head, , ...rows] = lines;
      return void out.push(
        <div key={key} className="overflow-x-auto">
          <table className="w-full border-collapse text-xs [&_td]:border [&_td]:border-[var(--border)] [&_td]:p-1.5 [&_td]:align-top [&_th]:border [&_th]:border-[var(--border)] [&_th]:p-1.5 [&_th]:text-left">
            <thead><tr>{cells(head).map((c, i) => <th key={i}>{inline(c, `${key}h${i}`)}</th>)}</tr></thead>
            <tbody>{rows.map((r, j) => <tr key={j}>{cells(r).map((c, i) => <td key={i}>{inline(c, `${key}r${j}c${i}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      );
    }
    // A paragraph may end in a list ("Máte právo:" then "- ..." lines).
    const first = lines.findIndex((l) => l.startsWith("- "));
    const para = first === -1 ? lines : lines.slice(0, first);
    if (para.length) out.push(<p key={key}>{inline(para.join(" "), key)}</p>);
    if (first !== -1) out.push(<ul key={`${key}l`}>{lines.slice(first).map((l, i) => <li key={i}>{inline(l.slice(2), `${key}l${i}`)}</li>)}</ul>);
  });
  return <>{out}</>;
}

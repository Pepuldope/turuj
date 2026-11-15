import { notFound } from "next/navigation";

// An unknown address under /en: sends it to app/en/not-found.tsx, so the 404 comes with English metadata.
export default function UnknownEnglishPage() {
  notFound();
}

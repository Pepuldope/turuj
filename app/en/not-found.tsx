import type { Metadata } from "next";
import NotFound from "@/app/not-found";

// The same page as the Slovak 404, but with an English title (the root one cannot tell the language of an unknown address).
export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

export default NotFound;

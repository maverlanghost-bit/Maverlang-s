import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { site } from "@/config/site";
import { UiCatalog } from "./catalog";

export const metadata: Metadata = {
  title: `Primitivos · ${site.name}`,
  robots: { index: false, follow: false },
};

export default function DevUiPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <UiCatalog />;
}

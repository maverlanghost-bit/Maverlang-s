import { PageNotFound } from "@/components/landing/page-not-found";

/**
 * 404 de un slug de marketing. El layout ya trae el único `<main>` y `lang`;
 * `PageNotFound` pone el mensaje centrado y los accesos directos (T70).
 */
export default function MarketingNotFound() {
  return <PageNotFound />;
}

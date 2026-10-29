import { NotFoundView } from "@/components/ui/not-found-view";

/** 404 de un slug de marketing. El layout ya trae el único `<main>` y `lang`. */
export default function MarketingNotFound() {
  return <NotFoundView kind="page" />;
}

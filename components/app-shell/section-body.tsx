"use client";

import type { ShellSection } from "@/components/app-shell/nav";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { useT } from "@/lib/hooks/use-t";

export function SectionBody({ section }: { section: ShellSection }) {
  const { t } = useT();
  const page = t.pages[section];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={page.title} description={page.lead} />
      <EmptyState title={page.emptyTitle} description={t.states.unavailable} />
    </div>
  );
}

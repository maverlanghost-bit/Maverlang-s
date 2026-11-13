"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { InvestorPassportCard } from "@/components/domain/investor-passport-card";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Dialog } from "@/components/ui/dialog";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { LoadingState } from "@/components/ui/loading-state";
import { useToast } from "@/components/ui/toast";
import { requestDeletion, updateMe } from "@/lib/api/client";
import { useSession } from "@/lib/auth";
import { useDeletionStatus, useMe } from "@/lib/hooks/queries";
import { useT } from "@/lib/hooks/use-t";
import { isProfileMigrationMessage } from "@/lib/profile/migration";

import { fill, formatWhen, regionName, SettingsFrame, SettingsPanel } from "../ui";

const ROW =
  "flex min-h-12 w-full items-center gap-3 px-4 py-3.5 text-left text-[15px] leading-5 outline-none transition-colors duration-[140ms] focus-visible:ring-4 focus-visible:ring-fg/20 focus-visible:ring-inset md:px-5";

/** Fila de formulario: rótulo mono, valor y, si hace falta, una ayuda corta. */
function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 border-t border-border/70 px-4 py-4 first:border-t-0 md:px-5">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="label">
          {label}
        </label>
      ) : (
        <p className="label">{label}</p>
      )}
      {children}
      {hint ? <p className="text-[13px] leading-5 text-fg-muted">{hint}</p> : null}
    </div>
  );
}

export function AccountScreen() {
  const { t, language } = useT();
  const { status, logout } = useSession();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const me = useMe();
  const deletion = useDeletionStatus();
  const [draft, setDraft] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [recording, setRecording] = useState(false);

  const profile = me.data;
  const name = draft ?? profile?.displayName ?? "";
  const requestedAt = deletion.data?.requestedAt ?? null;

  if (isProfileMigrationMessage(me.error)) {
    return (
      <SettingsFrame title={t.profile.account} description={t.profile.accountLead}>
        <p role="status" className="rounded-2xl bg-surface-1 px-4 py-3 text-[13px] leading-5 text-fg-muted shadow-card">
          {t.profile.schemaMissing}
        </p>
        <Button type="button" variant="secondary" size="lg" className="w-full" disabled={status === "loading"} onClick={() => void logout()}>
          {t.profile.logout}
        </Button>
      </SettingsFrame>
    );
  }

  if (me.isPending) {
    return (
      <SettingsFrame title={t.profile.account} description={t.profile.accountLead}>
        <SettingsPanel>
          <div className="px-4 py-4 md:px-5">
            <LoadingState variant="list" label={t.states.loading} />
          </div>
        </SettingsPanel>
      </SettingsFrame>
    );
  }
  if (me.isError || !profile) {
    return (
      <SettingsFrame title={t.profile.account} description={t.profile.accountLead}>
        <ErrorState
          label={t.states.error}
          title={t.profile.loadError}
          retryLabel={t.states.retry}
          onRetry={() => void me.refetch()}
        />
      </SettingsFrame>
    );
  }

  async function saveName() {
    const displayName = name.trim();
    if (displayName.length < 1 || displayName.length > 80) {
      setNameError(t.profile.nameInvalid);
      return;
    }
    if (displayName === (profile?.displayName ?? "")) return;
    setSaving(true);
    setNameError(null);
    try {
      const next = await updateMe({ displayName });
      queryClient.setQueryData(["me"], next);
      setDraft(null);
      toast({ title: t.profile.nameSaved, tone: "up" });
    } catch {
      setNameError(t.profile.nameError);
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeletion() {
    setRecording(true);
    try {
      const next = await requestDeletion();
      queryClient.setQueryData(["deletion"], next);
      toast({ title: t.profile.deleteDone, tone: "up" });
    } catch {
      toast({ title: t.profile.deleteError, tone: "down" });
    } finally {
      setRecording(false);
    }
  }

  const recordedDate = requestedAt ? formatWhen(requestedAt, language, t.profile.unknownDate) : null;

  return (
    <SettingsFrame title={t.profile.account} description={t.profile.accountLead}>
      <InvestorPassportCard
        displayName={profile.displayName}
        email={profile.email}
        country={profile.country}
        userId={profile.id}
      />
      <SettingsPanel>
        <Field label={t.profile.name} hint={t.profile.nameHint} htmlFor="display-name">
          <form
            className="flex flex-col gap-3 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              void saveName();
            }}
          >
            <Input
              id="display-name"
              value={name}
              maxLength={80}
              autoComplete="name"
              placeholder={t.profile.namePlaceholder}
              onChange={(event) => {
                setDraft(event.target.value);
                setNameError(null);
              }}
            />
            <Button
              type="submit"
              size="lg"
              className="shrink-0"
              loading={saving}
              disabled={saving || name.trim() === (profile.displayName ?? "")}
            >
              {saving ? t.profile.nameSaving : t.profile.nameSave}
            </Button>
          </form>
          {nameError ? (
            <p role="alert" className="text-[13px] leading-5 text-down">
              {nameError}
            </p>
          ) : null}
        </Field>
        <Field label={t.profile.email} hint={t.profile.emailReadonly}>
          <p className="text-[15px] leading-6 break-all text-fg">{profile.email ?? t.profile.noEmail}</p>
        </Field>
        <Field label={t.profile.country}>
          <p className="text-[15px] leading-6 text-fg">{regionName(profile.country, language, t.profile.noCountry)}</p>
        </Field>
        <Field label={t.profile.userId}>
          <div className="flex flex-wrap items-center gap-2">
            <p className="num min-w-0 flex-1 text-[13px] leading-5 break-all text-fg">{profile.id}</p>
            <CopyButton value={profile.id} label={t.profile.copy} copiedLabel={t.profile.copied} />
          </div>
        </Field>
      </SettingsPanel>

      <SettingsPanel>
        <button
          type="button"
          className={`${ROW} text-fg hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-50`}
          disabled={status === "loading"}
          onClick={() => void logout()}
        >
          {t.profile.logout}
        </button>
        <button
          type="button"
          className={`${ROW} border-t border-border/70 text-down hover:bg-surface-2`}
          onClick={() => setOpen(true)}
        >
          {t.profile.delete}
        </button>
      </SettingsPanel>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={requestedAt ? t.profile.deleteDone : t.profile.deleteTitle}
        description={t.profile.deleteBody}
      >
        {process.env.NEXT_PUBLIC_DATA_MODE?.trim() === "live" ? null : (
          <p className="text-sm leading-relaxed text-fg-body">{t.profile.deleteMock}</p>
        )}
        {recordedDate ? (
          <p className="mt-3 text-sm text-fg">{fill(t.profile.deleteDoneBody, { date: recordedDate })}</p>
        ) : null}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" size="lg" onClick={() => setOpen(false)}>
            {requestedAt ? t.profile.deleteClose : t.profile.deleteCancel}
          </Button>
          {requestedAt ? null : (
            <Button type="button" variant="danger" size="lg" loading={recording} onClick={() => void confirmDeletion()}>
              {t.profile.deleteConfirm}
            </Button>
          )}
        </div>
      </Dialog>
    </SettingsFrame>
  );
}

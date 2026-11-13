"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

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

import {
  fill,
  formatWhen,
  regionName,
  SettingsButton,
  SettingsField,
  SettingsFrame,
  SettingsItem,
  SettingsList,
  SettingsNote,
  SettingsPanel,
  SettingsPanelBody,
  SettingsValue,
} from "../ui";

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
        <SettingsNote role="status">{t.profile.schemaMissing}</SettingsNote>
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
          <SettingsPanelBody>
            <LoadingState variant="list" label={t.states.loading} />
          </SettingsPanelBody>
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
        <SettingsField label={t.profile.name} hint={t.profile.nameHint} htmlFor="display-name">
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
        </SettingsField>
        <SettingsField label={t.profile.email} hint={t.profile.emailReadonly}>
          <SettingsValue className="break-all">{profile.email ?? t.profile.noEmail}</SettingsValue>
        </SettingsField>
        <SettingsField label={t.profile.country}>
          <SettingsValue>{regionName(profile.country, language, t.profile.noCountry)}</SettingsValue>
        </SettingsField>
        <SettingsField label={t.profile.userId}>
          <div className="flex flex-wrap items-center gap-2">
            <p className="num min-w-0 flex-1 text-[13px] leading-5 break-all text-fg">{profile.id}</p>
            <CopyButton value={profile.id} label={t.profile.copy} copiedLabel={t.profile.copied} />
          </div>
        </SettingsField>
      </SettingsPanel>

      <SettingsPanel>
        <SettingsList>
          <SettingsItem>
            <SettingsButton disabled={status === "loading"} onClick={() => void logout()}>
              {t.profile.logout}
            </SettingsButton>
          </SettingsItem>
          <SettingsItem>
            <SettingsButton tone="danger" onClick={() => setOpen(true)}>
              {t.profile.delete}
            </SettingsButton>
          </SettingsItem>
        </SettingsList>
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

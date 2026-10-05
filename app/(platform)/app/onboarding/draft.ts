import type { OnboardingInput } from "./schema";

export type OnboardingStep = 1 | 2 | 3 | 4 | 5;

export type LegalVersions = {
  terminos: string;
  privacidad: string;
  riesgos: string;
};

/** Borrador en `localStorage`. `v` deja ignorar un formato viejo. */
export type OnboardingDraft = {
  v: 1;
  userId: string;
  step: OnboardingStep;
  country: string;
  notUsPerson: boolean;
  terminos: boolean;
  privacidad: boolean;
  riesgos: boolean;
  consentsSaved: boolean;
  consentVersionKey: string | null;
  walletReady: boolean;
  finished: boolean;
};

const STORAGE_KEY = "a24_onb_draft";

export function versionKey(versions: LegalVersions): string {
  return `${versions.terminos}\n${versions.privacidad}\n${versions.riesgos}`;
}

export function emptyDraft(userId: string): OnboardingDraft {
  return {
    v: 1,
    userId,
    step: 1,
    country: "",
    notUsPerson: false,
    terminos: false,
    privacidad: false,
    riesgos: false,
    consentsSaved: false,
    consentVersionKey: null,
    walletReady: false,
    finished: false,
  };
}

export function formValues(draft: OnboardingDraft): OnboardingInput {
  return {
    country: draft.country,
    notUsPerson: draft.notUsPerson,
    terminos: draft.terminos,
    privacidad: draft.privacidad,
    riesgos: draft.riesgos,
  };
}

function isStep(value: unknown): value is OnboardingStep {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function consentsCurrent(draft: OnboardingDraft, versions: LegalVersions): boolean {
  return (
    draft.consentsSaved &&
    draft.terminos &&
    draft.privacidad &&
    draft.riesgos &&
    draft.consentVersionKey === versionKey(versions)
  );
}

/**
 * Baja el paso si falta un dato anterior. Un borrador editado no puede abrir
 * el paso 5 sin país, declaración, consentimientos y billetera.
 */
export function clampDraft(draft: OnboardingDraft, versions: LegalVersions): OnboardingDraft {
  const countryOk = /^[A-Z]{2}$/.test(draft.country) && draft.country !== "US";
  const consentsOk = consentsCurrent(draft, versions);
  let step = draft.step;

  if (!countryOk) step = 1;
  else if (!draft.notUsPerson) step = Math.min(step, 2) as OnboardingStep;
  else if (!consentsOk) step = Math.min(step, 3) as OnboardingStep;
  else if (!draft.walletReady) step = Math.min(step, 4) as OnboardingStep;

  return {
    ...draft,
    step,
    consentsSaved: consentsOk,
    consentVersionKey: consentsOk ? draft.consentVersionKey : null,
    finished: step === 5 && draft.finished && consentsOk && draft.walletReady,
  };
}

export function readDraftRaw(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function loadDraft(userId: string, versions: LegalVersions): OnboardingDraft | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.v !== 1 || parsed.userId !== userId) return null;
    const draft = clampDraft(
      {
        v: 1,
        userId,
        step: isStep(parsed.step) ? parsed.step : 1,
        country: typeof parsed.country === "string" ? parsed.country.trim().toUpperCase() : "",
        notUsPerson: parsed.notUsPerson === true,
        terminos: parsed.terminos === true,
        privacidad: parsed.privacidad === true,
        riesgos: parsed.riesgos === true,
        consentsSaved: parsed.consentsSaved === true,
        consentVersionKey: typeof parsed.consentVersionKey === "string" ? parsed.consentVersionKey : null,
        walletReady: parsed.walletReady === true,
        finished: parsed.finished === true,
      },
      versions,
    );
    return draft;
  } catch {
    return null;
  }
}

export function saveDraft(draft: OnboardingDraft): void {
  try {
    const next = JSON.stringify(draft);
    if (localStorage.getItem(STORAGE_KEY) === next) return;
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Modo privado: el avance sigue en memoria durante esta visita.
  }
}

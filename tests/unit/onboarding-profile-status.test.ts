import { describe, expect, it } from "vitest";

import {
  hasCurrentDeclarationEvidence,
  onboardingProfileStatus,
  supportChannel,
} from "@/app/(platform)/app/onboarding/status";

const CURRENT = "2026-10-draft";

const consent = (overrides: Partial<{ doc: string; version: string; acceptedAt: string }> = {}) => ({
  doc: "us_person",
  version: CURRENT,
  acceptedAt: "2026-10-08T12:00:00.000Z",
  ...overrides,
});

describe("onboardingProfileStatus", () => {
  it("sin onboarding completo deja pasar al wizard", () => {
    expect(
      onboardingProfileStatus({
        onboardingCompleted: false,
        isUsPerson: false,
        currentDeclarationVersion: CURRENT,
        consents: [],
      }),
    ).toEqual({ kind: "pending" });
  });

  it("un 'sí' explícito nunca abre el wizard", () => {
    expect(
      onboardingProfileStatus({
        onboardingCompleted: false,
        isUsPerson: true,
        currentDeclarationVersion: CURRENT,
        consents: [consent()],
      }),
    ).toEqual({ kind: "us_person_blocked" });
  });

  it("perfil completo con declaración vigente queda completo", () => {
    expect(
      onboardingProfileStatus({
        onboardingCompleted: true,
        isUsPerson: false,
        currentDeclarationVersion: CURRENT,
        consents: [consent()],
      }),
    ).toEqual({ kind: "complete" });
  });

  it("perfil completo sin declaración vigente se deriva a revisión, no al wizard", () => {
    expect(
      onboardingProfileStatus({
        onboardingCompleted: true,
        isUsPerson: false,
        currentDeclarationVersion: CURRENT,
        consents: [],
      }),
    ).toEqual({ kind: "declaration_review" });

    expect(
      onboardingProfileStatus({
        onboardingCompleted: true,
        isUsPerson: false,
        currentDeclarationVersion: CURRENT,
        consents: [consent({ version: "2026-09-draft" })],
      }),
    ).toEqual({ kind: "declaration_review" });

    expect(
      onboardingProfileStatus({
        onboardingCompleted: true,
        isUsPerson: null,
        currentDeclarationVersion: CURRENT,
        consents: [consent()],
      }),
    ).toEqual({ kind: "declaration_review" });
  });

  it("una fecha inválida o una versión vigente vacía no son evidencia", () => {
    expect(hasCurrentDeclarationEvidence([consent({ acceptedAt: "no-es-fecha" })], CURRENT)).toBe(false);
    expect(hasCurrentDeclarationEvidence([consent()], "")).toBe(false);
  });
});

describe("supportChannel", () => {
  it("usa el correo configurado sin datos de la cuenta en el asunto", () => {
    const channel = supportChannel("soporte@maverlang.test");
    expect(channel.kind).toBe("email");
    expect(channel.href).toContain("mailto:soporte@maverlang.test?subject=");
    expect(decodeURIComponent(channel.href)).not.toContain("@ejemplo");
    expect(decodeURIComponent(channel.href)).not.toMatch(/rut|telefono|correo=/i);
  });

  it("sin correo válido no inventa contacto y deja el Centro de ayuda", () => {
    expect(supportChannel("")).toEqual({ kind: "help", href: "/ayuda", label: "Centro de ayuda" });
    expect(supportChannel("por-publicar")).toEqual({ kind: "help", href: "/ayuda", label: "Centro de ayuda" });
  });
});

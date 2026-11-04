import "server-only";

import { DomainError } from "@/lib/api/result";
import {
  addDemoConsent,
  demoConsents,
  getDemoDeletion,
  getDemoPrefs,
  getDemoProfile,
  recordDemoUsPersonDeclaration,
  requestDemoDeletion,
  setDemoPrefs,
  updateDemoProfile,
} from "@/lib/mocks/demo-state";
import { simulateMock } from "@/lib/mocks/latency";
import { sanitizeFavoriteSymbols } from "@/lib/favorites/merge";
import type { ComplianceWriteInput } from "@/lib/compliance/profile-write";
import { checkUsPersonDeclaration, usPersonDeclarationErrorMessage } from "@/lib/compliance/us-person";
import type { Consent, Preferences, UserProfile } from "@/lib/types";

const mockFavorites = new Map<string, string[]>();

export const mockUsers = {
  async get(id: string): Promise<UserProfile> {
    return simulateMock(`user:${id}`, () => getDemoProfileFor(id));
  },

  async update(id: string, patch: Partial<UserProfile> & ComplianceWriteInput): Promise<UserProfile> {
    return simulateMock(`user-update:${id}`, () => updateDemoProfileFor(id, patch));
  },

  async addConsent(row: Consent): Promise<Consent> {
    return simulateMock(`consent:${row.userId}:${row.doc}:${row.version}`, () => addDemoConsent(row));
  },

  async listConsents(id: string): Promise<Consent[]> {
    return simulateMock(`consents:${id}`, () => demoConsents(id));
  },

  async deletionStatus(id: string): Promise<{ requestedAt: string | null }> {
    return simulateMock(`deletion:${id}`, () => getDemoDeletion(id));
  },

  async requestDeletion(id: string): Promise<{ requestedAt: string }> {
    return simulateMock(`deletion-request:${id}`, () => requestDemoDeletion(id));
  },

  async prefs(id: string): Promise<Preferences> {
    return simulateMock(`prefs:${id}`, () => getDemoPrefs(id));
  },

  async setPrefs(id: string, prefs: Preferences): Promise<Preferences> {
    return simulateMock(`prefs-set:${id}`, () => setDemoPrefs(id, prefs));
  },

  async listFavorites(id: string): Promise<string[]> {
    return simulateMock(`favorites:${id}`, () => [...(mockFavorites.get(id) ?? [])]);
  },

  async saveFavorites(id: string, symbols: string[]): Promise<string[]> {
    return simulateMock(`favorites-set:${id}`, () => {
      const clean = sanitizeFavoriteSymbols(symbols);
      mockFavorites.set(id, clean);
      return clean;
    });
  },
};

function getDemoProfileFor(id: string): UserProfile {
  const profile = getDemoProfile();
  if (profile.id !== id) throw new DomainError("NOT_FOUND", "No encontramos esa cuenta.");
  return profile;
}

/**
 * DB-03 en la demo: la cuenta sintética puede seguir sin declaración. Sólo
 * se escribe `is_us_person = false` cuando llega un "no" explícito con la
 * versión vigente del servidor (`checkUsPersonDeclaration` la compara contra
 * `serverEnv`, nunca contra el texto del cliente); `isUsPerson` enviado por
 * el cliente se ignora (nunca se inventa).
 */
function updateDemoProfileFor(id: string, patch: Partial<UserProfile> & ComplianceWriteInput): UserProfile {
  if (patch.isUsPerson === true) {
    throw new DomainError("VALIDATION", usPersonDeclarationErrorMessage("us_person"));
  }
  const check = checkUsPersonDeclaration({
    usPersonDeclaration: patch.usPersonDeclaration,
    usPersonDeclarationVersion: patch.usPersonDeclarationVersion,
  });
  if (check.kind === "blocked") {
    throw new DomainError("VALIDATION", usPersonDeclarationErrorMessage(check.reason));
  }
  if (check.kind === "declared") {
    recordDemoUsPersonDeclaration(id, {
      version: check.version,
      declaredAt: new Date().toISOString(),
    });
  }
  return updateDemoProfile(id, patch);
}

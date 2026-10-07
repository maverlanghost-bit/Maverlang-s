import "server-only";

import { DomainError } from "@/lib/api/result";
import {
  addDemoConsent,
  demoConsents,
  getDemoDeletion,
  getDemoPrefs,
  getDemoProfile,
  requestDemoDeletion,
  setDemoPrefs,
  updateDemoProfile,
} from "@/lib/mocks/demo-state";
import { simulateMock } from "@/lib/mocks/latency";
import { sanitizeFavoriteSymbols } from "@/lib/favorites/merge";
import type { Consent, Preferences, UserProfile } from "@/lib/types";

const mockFavorites = new Map<string, string[]>();

export const mockUsers = {
  async get(id: string): Promise<UserProfile> {
    return simulateMock(`user:${id}`, () => getDemoProfileFor(id));
  },

  async update(id: string, patch: Partial<UserProfile>): Promise<UserProfile> {
    return simulateMock(`user-update:${id}`, () => updateDemoProfile(id, patch));
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

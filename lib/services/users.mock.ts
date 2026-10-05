import "server-only";

import { DomainError } from "@/lib/api/result";
import {
  addDemoConsent,
  getDemoPrefs,
  getDemoProfile,
  setDemoPrefs,
  updateDemoProfile,
} from "@/lib/mocks/demo-state";
import { simulateMock } from "@/lib/mocks/latency";
import type { Consent, Preferences, UserProfile } from "@/lib/types";

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

  async prefs(id: string): Promise<Preferences> {
    return simulateMock(`prefs:${id}`, () => getDemoPrefs(id));
  },

  async setPrefs(id: string, prefs: Preferences): Promise<Preferences> {
    return simulateMock(`prefs-set:${id}`, () => setDemoPrefs(id, prefs));
  },
};

function getDemoProfileFor(id: string): UserProfile {
  const profile = getDemoProfile();
  if (profile.id !== id) throw new DomainError("NOT_FOUND", "No encontramos esa cuenta.");
  return profile;
}

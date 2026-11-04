import { z } from "zod";

import {
  US_PERSON_UNANSWERED_MESSAGE,
  type UsPersonDeclaration,
} from "@/config/compliance";
import { US_RESIDENT_MESSAGE } from "@/lib/auth/registro-schema";

import { isResidenceCountry } from "./countries";

const requiredCheck = (message: string) =>
  z.boolean().refine((value): value is true => value, message);

export const onboardingSchema = z
  .object({
    country: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/, "Elige tu país de residencia.")
      .refine(isResidenceCountry, "Elige tu país de residencia."),
    nationality: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/, "Elige tu nacionalidad.")
      .refine(isResidenceCountry, "Elige tu nacionalidad."),
    /** DB-03: `null` = no respondió. No hay opción marcada por defecto. */
    usPersonDeclaration: z.enum(["yes", "no"]).nullable(),
    terminos: requiredCheck("Acepta los términos y condiciones."),
    privacidad: requiredCheck("Acepta la política de privacidad."),
    riesgos: requiredCheck("Acepta la divulgación de riesgos."),
  })
  .superRefine((data, ctx) => {
    if (data.usPersonDeclaration === null) {
      ctx.addIssue({
        code: "custom",
        path: ["usPersonDeclaration"],
        message: US_PERSON_UNANSWERED_MESSAGE,
      });
    }
    if (data.usPersonDeclaration === "yes") {
      ctx.addIssue({
        code: "custom",
        path: ["usPersonDeclaration"],
        message: US_RESIDENT_MESSAGE,
      });
    }
  });

export type OnboardingInput = z.input<typeof onboardingSchema>;
export type OnboardingOutput = z.output<typeof onboardingSchema>;

export type OnboardingDeclaration = UsPersonDeclaration | null;

export const EMPTY_ONBOARDING: OnboardingInput = {
  country: "",
  nationality: "",
  usPersonDeclaration: null,
  terminos: false,
  privacidad: false,
  riesgos: false,
};

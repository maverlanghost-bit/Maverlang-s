import { z } from "zod";

import { isResidenceCountry } from "./countries";

const requiredCheck = (message: string) =>
  z.boolean().refine((value): value is true => value, message);

export const onboardingSchema = z.object({
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
  notUsPerson: requiredCheck("Confirma la declaración de países restringidos."),
  terminos: requiredCheck("Acepta los términos y condiciones."),
  privacidad: requiredCheck("Acepta la política de privacidad."),
  riesgos: requiredCheck("Acepta la divulgación de riesgos."),
});

export type OnboardingInput = z.input<typeof onboardingSchema>;
export type OnboardingOutput = z.output<typeof onboardingSchema>;

export const EMPTY_ONBOARDING: OnboardingInput = {
  country: "",
  nationality: "",
  notUsPerson: false,
  terminos: false,
  privacidad: false,
  riesgos: false,
};

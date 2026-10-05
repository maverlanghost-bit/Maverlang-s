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
  notUsPerson: requiredCheck("Confirma que no eres ciudadano ni residente de EE.UU."),
  terminos: requiredCheck("Acepta los términos y condiciones."),
  privacidad: requiredCheck("Acepta la política de privacidad."),
  riesgos: requiredCheck("Acepta la divulgación de riesgos."),
});

export type OnboardingInput = z.input<typeof onboardingSchema>;
export type OnboardingOutput = z.output<typeof onboardingSchema>;

export const EMPTY_ONBOARDING: OnboardingInput = {
  country: "",
  notUsPerson: false,
  terminos: false,
  privacidad: false,
  riesgos: false,
};

import { z } from "zod";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const loginSchema = z.object({
  email: z.string().trim().regex(EMAIL, "Ingresa un correo válido."),
  password: z.string().min(1, "Ingresa tu contraseña."),
});

export const recuperarSchema = z.object({
  email: z.string().trim().regex(EMAIL, "Ingresa un correo válido."),
});

export const restablecerSchema = z
  .object({
    password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres."),
    passwordConfirm: z.string(),
  })
  .superRefine((data, ctx) => {
    if (data.password !== data.passwordConfirm) {
      ctx.addIssue({ code: "custom", path: ["passwordConfirm"], message: "Las contraseñas no coinciden." });
    }
  });

export type LoginValues = z.infer<typeof loginSchema>;
export type RecuperarValues = z.infer<typeof recuperarSchema>;
export type RestablecerValues = z.infer<typeof restablecerSchema>;

// Tipos de imágenes importadas como módulo (next/image). Normalmente vienen de
// next-env.d.ts, que está en .gitignore y no existe en CI antes del build.
declare module "*.png" {
  const content: import("next/image").StaticImageData;
  export default content;
}

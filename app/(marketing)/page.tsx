import { site } from "@/config/site";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-6 px-5 py-20">
      <p className="label">Temporal</p>
      <h1 className="font-display text-4xl leading-[1.05] tracking-tight text-balance sm:text-5xl lg:text-6xl">
        {site.name}
      </h1>
      <p className="text-sm leading-relaxed text-fg-body sm:text-base">
        Página temporal para confirmar la tipografía y los colores.
      </p>
      <button
        type="button"
        className="h-9 w-fit rounded-full bg-fg px-4 font-normal text-white transition duration-[140ms] hover:bg-[#1f2329] active:scale-[0.98] focus-visible:ring-4 focus-visible:ring-fg/20 disabled:opacity-40 md:h-11 md:px-6"
      >
        Continuar
      </button>
    </main>
  );
}

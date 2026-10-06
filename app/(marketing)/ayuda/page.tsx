import type { Metadata } from "next";
import { FaqList } from "@/components/landing/faq";
import { LandingSection } from "@/components/landing/section";
import { site } from "@/config/site";
import { getFaq } from "@/lib/content/faq";

export const metadata: Metadata = {
  title: "Ayuda",
  description: `Preguntas sobre acciones tokenizadas, depósitos, costos y riesgos en ${site.name}.`,
};

export default function AyudaPage() {
  return (
    <main>
      <LandingSection titleId="ayuda-title">
        <div className="max-w-2xl">
          <p className="label">Ayuda</p>
          <h1 id="ayuda-title" className="mt-3 text-3xl sm:text-4xl">
            Preguntas frecuentes
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-fg-body sm:text-base">
            Nueve respuestas cortas. Términos, privacidad, riesgos y comisiones siguen en borrador.
          </p>
        </div>
        <div className="mt-10 max-w-3xl md:mt-14">
          <FaqList entries={getFaq(site.name)} type="multiple" />
        </div>
      </LandingSection>
    </main>
  );
}

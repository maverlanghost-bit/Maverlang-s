import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/image", async () => {
  const ReactModule = await import("react");
  return {
    default: (props: { src: string; alt?: string; width?: number; height?: number; className?: string }) =>
      ReactModule.createElement("img", {
        src: props.src,
        alt: props.alt,
        width: props.width,
        height: props.height,
        className: props.className,
      }),
  };
});

import { companyLogosEnabled } from "@/lib/config/brand";
import { TickerLogo } from "@/components/domain/ticker-logo";

const PREV = process.env.NEXT_PUBLIC_COMPANY_LOGOS;

afterEach(() => {
  if (PREV === undefined) delete process.env.NEXT_PUBLIC_COMPANY_LOGOS;
  else process.env.NEXT_PUBLIC_COMPANY_LOGOS = PREV;
  vi.unstubAllEnvs();
});

describe("M45: flag de logos de empresas", () => {
  it("companyLogosEnabled es true sin variable", () => {
    delete process.env.NEXT_PUBLIC_COMPANY_LOGOS;
    expect(companyLogosEnabled()).toBe(true);
    expect(companyLogosEnabled(undefined)).toBe(true);
  });

  it("companyLogosEnabled es true con on", () => {
    expect(companyLogosEnabled("on")).toBe(true);
    expect(companyLogosEnabled(" ON ")).toBe(true);
  });

  it("companyLogosEnabled es false con off", () => {
    expect(companyLogosEnabled("off")).toBe(false);
    expect(companyLogosEnabled(" OFF ")).toBe(false);
  });

  it("con off no renderiza <img> y tiene aria-label", () => {
    process.env.NEXT_PUBLIC_COMPANY_LOGOS = "off";
    const markup = renderToStaticMarkup(
      React.createElement(TickerLogo, {
        symbol: "AAPLx",
        name: "Apple",
        logoUrl: "/logos/aapl.png",
        size: 36,
      }),
    );
    expect(markup).not.toContain("<img");
    expect(markup).toContain('aria-label="Apple (AAPLx)"');
    expect(markup).not.toContain("/logos/");
  });

  it("con on usa la imagen como antes", () => {
    process.env.NEXT_PUBLIC_COMPANY_LOGOS = "on";
    const markup = renderToStaticMarkup(
      React.createElement(TickerLogo, {
        symbol: "AAPLx",
        name: "Apple",
        logoUrl: "/logos/aapl.png",
        size: 36,
      }),
    );
    expect(markup).toContain("<img");
    expect(markup).toContain("/logos/aapl.png");
    expect(markup).not.toContain("aria-label");
  });
});

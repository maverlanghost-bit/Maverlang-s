import type { MetadataRoute } from "next";

import mark from "@/app/icon.png";
import { buildManifestFields } from "@/components/pwa/policy";
import { site } from "@/config/site";

export default function manifest(): MetadataRoute.Manifest {
  return buildManifestFields({
    name: site.name,
    description: site.description,
    markSrc: mark.src,
    markWidth: mark.width,
    markHeight: mark.height,
  });
}

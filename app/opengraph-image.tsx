import { ImageResponse } from "next/og";
import { ShareImage, shareImageAlt, shareImageSize } from "@/lib/seo/share-image";

export const alt = shareImageAlt;
export const size = shareImageSize;
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(<ShareImage />, { ...size });
}

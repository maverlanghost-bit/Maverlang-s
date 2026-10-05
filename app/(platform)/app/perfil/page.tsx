import type { Metadata } from "next";

import packageJson from "@/package.json";

import { ProfileScreen } from "./profile-screen";

export const metadata: Metadata = {
  title: "Perfil",
};

export default function PerfilPage() {
  return <ProfileScreen version={packageJson.version} />;
}

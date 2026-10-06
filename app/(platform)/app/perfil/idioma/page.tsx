import { redirect } from "next/navigation";

/** /app/perfil/idioma ahora vive en /app/ajustes (M40). */
export default function IdiomaPage() {
  redirect("/app/ajustes");
}

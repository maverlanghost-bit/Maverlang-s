import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { isValidChatId } from "@/components/ai/chat-url";

import { AsistenteScreen } from "../../asistente-screen";

export const metadata: Metadata = {
  title: "Asistente",
  // Chats privados: nunca indexables y el título no filtra contenido.
  robots: { index: false, follow: false },
};

export default async function AsistenteChatPage({
  params,
}: {
  params: Promise<{ chatId: string }>;
}) {
  const { chatId } = await params;
  if (!isValidChatId(chatId)) notFound();
  // key fija: cambiar de chat (replaceState) no debe remontar la pantalla.
  return (
    <AsistenteScreen key="chat" initialQuery="" initialTicker="" initialChatId={chatId} />
  );
}

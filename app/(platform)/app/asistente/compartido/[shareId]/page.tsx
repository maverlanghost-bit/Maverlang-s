import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getSharedChat, isValidShareId } from "@/lib/ai/share-store";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ shareId: string }>;
}): Promise<Metadata> {
  const { shareId } = await params;
  const chat = isValidShareId(shareId) ? await getSharedChat(shareId) : null;
  return {
    title: chat ? `${chat.title} · Maverlang AI` : "Conversación compartida · Maverlang AI",
    robots: { index: false, follow: false },
  };
}

function formatSharedDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default async function SharedChatPage({
  params,
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = await params;
  if (!isValidShareId(shareId)) notFound();

  const chat = await getSharedChat(shareId);
  if (!chat) notFound();

  const formattedDate = formatSharedDate(chat.createdAt);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex flex-col gap-4 rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="min-w-0">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-600">
            <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
            Conversación compartida · Solo lectura
          </span>
          <h1 className="mt-3 break-words text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">
            {chat.title}
          </h1>
          {formattedDate ? (
            <p className="mt-1 text-xs text-zinc-500">Compartida el {formattedDate}</p>
          ) : null}
        </div>
        <Link
          href="/app/asistente"
          className="inline-flex shrink-0 items-center justify-center rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30"
        >
          Abrir Maverlang AI
        </Link>
      </header>

      <section
        aria-label="Transcripción de la conversación"
        className="mt-6 space-y-5 rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm sm:p-6"
      >
        {chat.messages.map((message, index) =>
          message.role === "user" ? (
            <div key={`user-${index}`} className="flex flex-col items-end gap-1">
              <span className="px-1 text-[11px] font-medium text-zinc-400">Usuario</span>
              <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-3xl bg-zinc-100 px-4 py-3 text-sm leading-relaxed text-zinc-900">
                {message.text}
              </div>
            </div>
          ) : (
            <div key={`assistant-${index}`} className="flex flex-col items-start gap-1">
              <span className="px-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                Maverlang AI
              </span>
              <div className="max-w-[92%] whitespace-pre-wrap break-words px-1 text-sm leading-relaxed text-zinc-800">
                {message.text}
              </div>
            </div>
          ),
        )}
      </section>

      <footer className="mt-6 flex flex-col items-center justify-between gap-2 px-1 text-xs text-zinc-400 sm:flex-row">
        <p>Maverlang AI · Transcripción compartida por un usuario · Solo lectura · No constituye asesoría financiera.</p>
        <Link
          href="/app/asistente"
          className="font-medium text-zinc-600 underline underline-offset-4 hover:text-zinc-900"
        >
          Iniciar tu propia consulta
        </Link>
      </footer>
    </main>
  );
}

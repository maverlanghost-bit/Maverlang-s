-- Maverlang — Conversaciones compartidas de Maverlang AI (solo lectura).
-- Idempotente: se puede volver a ejecutar sin romper estado existente.
-- RLS: tabla privada detrás de service_role; la ruta `/api/ai/share?id=...`
-- sirve una sola conversación por ID criptográfico aleatorio sin permitir listar.

create table if not exists public.ai_shared_chats (
  id text primary key
    check (id ~ '^[A-Za-z0-9_-]{8,32}$'),
  owner_id uuid references auth.users (id) on delete set null,
  title text not null
    check (char_length(title) between 1 and 160),
  messages jsonb not null
    check (jsonb_typeof(messages) = 'array' and jsonb_array_length(messages) between 1 and 40),
  created_at timestamptz not null default now()
);

alter table public.ai_shared_chats enable row level security;
alter table public.ai_shared_chats force row level security;

drop policy if exists "ai_shared_chats_public_select" on public.ai_shared_chats;
drop policy if exists "ai_shared_chats_auth_insert" on public.ai_shared_chats;

revoke all on table public.ai_shared_chats from public, anon, authenticated;
grant all on table public.ai_shared_chats to service_role;

create index if not exists ai_shared_chats_created_at_idx
  on public.ai_shared_chats (created_at desc);

-- Palestra — tabella per la sincronizzazione cloud via "codice di ripristino".
-- Ogni riga contiene il backup completo (jsonb) di un utente, indicizzato
-- dall'hash SHA-256 del codice segreto (il codice in chiaro non viene salvato).
-- Esegui in Supabase → SQL Editor.
--
-- Sicurezza: l'accesso passa SOLO dalla Edge Function `sync` (service role).
-- RLS è attiva senza policy, così la anon key non può leggere/scrivere la
-- tabella direttamente. Chi possiede il codice possiede i dati.

create table if not exists cloud_vaults (
  id         text primary key,           -- SHA-256 (hex) del codice di ripristino
  data       jsonb not null,             -- backup completo (come Esporta/Ripristina)
  updated_at timestamptz not null default now()
);

alter table cloud_vaults enable row level security;
-- Nessuna policy: nessun accesso via anon/authenticated; solo la service role
-- (usata dalla Edge Function) può leggere e scrivere.

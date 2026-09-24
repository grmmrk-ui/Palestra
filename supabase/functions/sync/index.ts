// Supabase Edge Function: backup cloud tramite "codice di ripristino".
// POST { action: 'push' | 'pull', code, data? }
//  - push: salva il backup completo (jsonb) sotto l'hash del codice
//  - pull: restituisce il backup salvato per quel codice (o null)
// Nessun login: deploy con --no-verify-jwt. L'accesso alla tabella avviene
// solo qui, con la service role key; chi ha il codice ha accesso ai dati.
//
// Deploy:  supabase functions deploy sync --no-verify-jwt
// (SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sono forniti in automatico)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const admin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

async function hashCode(code: string): Promise<string> {
  const norm = String(code).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(norm));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  try {
    const { action, code, data } = await req.json();
    if (!code || String(code).replace(/[^A-Za-z0-9]/g, '').length < 12) {
      return json({ error: 'codice non valido' }, 400);
    }
    const id = await hashCode(code);

    if (action === 'push') {
      if (!data || typeof data !== 'object') return json({ error: 'dati mancanti' }, 400);
      const { error } = await admin.from('cloud_vaults')
        .upsert({ id, data, updated_at: new Date().toISOString() });
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    if (action === 'pull') {
      const { data: row, error } = await admin.from('cloud_vaults')
        .select('data').eq('id', id).maybeSingle();
      if (error) return json({ error: error.message }, 500);
      return json({ data: row ? row.data : null });
    }

    return json({ error: 'azione sconosciuta' }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

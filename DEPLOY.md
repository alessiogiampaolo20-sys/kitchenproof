# KitchenProof — Deploy (Supabase EU + Vercel)

Guida per portare l'app online e usarla da più device. Tempo stimato: ~30 minuti.
I passi marcati **[TU]** li puoi fare solo tu (account/segreti); il resto posso eseguirlo io via CLI quando mi dai i valori.

## 1. Supabase (database, EU)

1. **[TU]** Crea un progetto su https://supabase.com/dashboard → New project
   - Region: **eu-central-1 (Frankfurt)** — requisito GDPR del progetto
   - Salva la **database password** che scegli
2. **[TU]** Dal progetto: Settings → API, copia:
   - `Project URL` → sarà `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (⚠️ mai nel client/repo)
3. Collega il repo al progetto e applica migrazioni + seed (posso farlo io):
   ```bash
   supabase link --project-ref <PROJECT_REF>   # chiede la db password
   supabase db push                            # applica tutte le migrazioni
   # seed di produzione: pack DK + corpus, SENZA org demo
   SEED_DEMO=0 \
   NEXT_PUBLIC_SUPABASE_URL=<url> \
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon> \
   SUPABASE_SERVICE_ROLE_KEY=<service> \
   pnpm db:seed
   ```
4. **[TU]** Auth → Providers → Email: per i tuoi test conviene **disattivare
   "Confirm email"** (Settings → Auth), così i tuoi account di prova entrano
   subito senza mail di conferma. Riattivalo prima di aprire al pubblico.

## 2. Vercel (app)

1. **[TU]** https://vercel.com → Add New Project → importa questo repo Git
   (se il repo non è ancora su GitHub: `gh repo create` — posso farlo io).
   Framework: Next.js (auto). Build: default (`pnpm build`).
2. **[TU]** Project → Settings → Environment Variables (Production):

   | Variabile | Valore |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | dal passo 1.2 |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | dal passo 1.2 |
   | `SUPABASE_SERVICE_ROLE_KEY` | dal passo 1.2 |
   | `ANTHROPIC_API_KEY` | la tua chiave (già in .env.local) |
   | `ACTOR_SESSION_SECRET` | genera: `openssl rand -base64 32` |
   | `CRON_SECRET` | genera: `openssl rand -hex 24` |
   | `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | riusa quelli in .env.local (o rigenera: `pnpm exec web-push generate-vapid-keys`) |
   | `RESEND_API_KEY` | *opzionale* — senza, le email (inviti/digest) finiscono solo nei log; i link d'invito restano copiabili dalla UI |
   | `EMAIL_FROM` | *opzionale*, es. `KitchenProof <noreply@tuodominio.dk>` |

   Non impostare `AI_PROVIDER` in produzione (deve usare l'API Claude vera).
3. Il cron è già configurato in `vercel.json` (ogni 15 min → `/api/cron/run`,
   autenticato da Vercel con `Bearer CRON_SECRET`): genera i task giornalieri,
   promemoria, fan-out normativi e digest settimanale.
4. **[TU]** Deploy. L'URL di produzione (es. `https://kitchenproof.vercel.app`)
   funziona su qualsiasi device; su tablet/telefono: "Aggiungi a schermata
   Home" → l'app si installa come PWA con supporto offline.

## 3. Primo utilizzo (account di prova)

1. Apri l'URL → **Opret konto / Create account** → questo è il tuo `org_owner`.
2. Crea l'organizzazione e il primo sito (tipo attività reale).
3. **Ruoli di prova**: Org → Members → invito con ruolo
   (`org_admin` / `site_manager` / `operator` / `consultant`) → la UI mostra il
   **link d'invito copiabile**: aprilo in una finestra in incognito e registra
   l'account con un'altra email. Ripetibile all'infinito.
4. Per ogni sito: Programme → wizard AI o skabelon → approva → i task partono.
   Members → "Sæt PIN" per ogni persona → sul tablet "Registrér enhed" → da lì
   ogni registrazione è attribuita alla persona via PIN.
5. Lingua: DA/EN/IT in alto in ogni schermata (cookie per device).

## 4. Cosa NON c'è ancora (deliberatamente)

- **Billing/Stripe (Phase 8)**: nessun paywall — chiunque si registri usa tutto.
  Va bene per il tuo periodo di test; da fare prima dell'apertura al pubblico.
- **Admin di piattaforma** (impersonation, pack studio): Phase 8.
- Hardening finale, load test, backup drill: Phase 9.

## 5. Dati per l'autorità

Tutto ciò che registri da subito è già "evidence-grade": record append-only,
timestamp server, attribuzione PIN, hash-chain audit, export PDF ufficiali e
bundle d'ispezione. Lo storico che crei durante i test personali su un'org
"vera" è utilizzabile — usa un'org separata per gli esperimenti butta-via.

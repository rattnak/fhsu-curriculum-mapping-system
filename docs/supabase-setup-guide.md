# Supabase Pro setup guide

Goal: a production Postgres database for the FHSU Curriculum Mapping System, owned by an organization that can later be handed to FHSU.

## 1. Create the organization (this is what you transfer later)
1. Sign in at https://supabase.com/dashboard (GitHub or email).
2. **New organization**. Name it for the owner you want long-term (e.g. `FHSU Curriculum Mapping`), not your personal name. Type: Team/Company.
3. Choose **Pro** and add a payment method. Pro is **$25/mo per organization**, which includes $10 of compute credit (covers one Micro instance). Extra projects bill compute separately.
4. Leave the **spend cap on** (the default) until you know your usage. Overages are blocked rather than billed.

Prices and quotas change; confirm on https://supabase.com/pricing before paying.

## 2. Create the project
1. **New project** inside that organization. Name: `fhsu-cms-prod`.
2. **Database password**: generate a long random one and save it in a password manager. You cannot read it back later (only reset it).
3. **Region**: closest to your API host and users (e.g. a US Central/East region). Region cannot be changed by a transfer.
4. Wait about 2 minutes for provisioning.

## 3. Get the connection string
Dashboard -> **Connect** (top bar) -> **Connection string** -> use the **Session pooler** (or Transaction pooler, port 6543, for serverless hosts). It looks like:
`postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres`

## 4. Lock down the auto-generated API
The app enforces roles and scopes in FastAPI, so the tables must not be reachable through Supabase's REST API.
- Dashboard -> **Project Settings -> Data API** -> disable the Data API, **or**
- after the tables exist, run in the SQL editor:
  ```sql
  do $$ declare t record; begin
    for t in select tablename from pg_tables where schemaname='public' loop
      execute format('alter table public.%I enable row level security', t.tablename);
    end loop; end $$;
  ```
  (RLS on with no policies = the anon/authenticated roles see nothing; the app's direct Postgres connection is unaffected.)

## 5. Point the app at it
```bash
cd backend
cp .env.example .env        # fill in DATABASE_URL, CMS_SECRET, CMS_CORS_ORIGINS
set -a; source .env; set +a
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m app.seed                          # schema + catalog, no test users
.venv/bin/python -m app.create_admin <username> "<First>" "<Last>"
.venv/bin/uvicorn app.main:app --port 8000
```
Generate the secret with `python3 -c "import secrets; print(secrets.token_urlsafe(48))"`. Never commit `.env`.

## 6. Verify
- Table Editor shows `node`, `user`, `outcome`, ... with data.
- `curl localhost:8000/health` returns ok; log in as the admin you created.
- Log in as a viewer-scoped user and request a higher scope: expect 403.

## 7. Backups
Pro includes daily backups (retention is short, commonly 7 days; check the dashboard under **Database -> Backups**). Point-in-time recovery is a paid add-on. For a system of record, also schedule your own `pg_dump` to storage you control.

## Transferring ownership

Two different things; you will likely want both when handing off to FHSU.

**A. Move the project to another organization** (Project Settings -> General -> **Transfer project**; docs: https://supabase.com/docs/guides/platform/project-transfer)
- You must be **Owner** of the source org and at least a **member** of the target org.
- Blockers: an active GitHub integration (disconnect first) and log drains configured.
- Transfers change the organization only, not the region.
- Billing moves with the project: the target org's plan applies. If the target is Free it may exceed the 2-free-project limit, so upgrade the target to Pro first.
- Expect brief or no downtime, but do it off-hours and verify the connection string afterwards.

**B. Hand over the whole organization** (simplest for a handoff)
- Organization -> **Team** -> invite the FHSU person with the **Owner** role, then (optionally) downgrade or remove yourself.
- Update **Billing** to FHSU's payment method/invoice contact.
- Organization settings are where the plan lives, so this carries Pro with it and avoids a project transfer entirely.

**Recommendation:** create a dedicated organization now (step 1), build there, and when FHSU is ready, add their owner (B). Use A only if you started the project in a personal org.

Before any handoff: rotate the database password and `CMS_SECRET`, and re-issue any API keys, since you saw the old ones.

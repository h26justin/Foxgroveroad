import fs from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'

/**
 * Builds the database from db/00_base_schema.sql + db/12 in an in-memory
 * Postgres and checks the account-security rules. PGlite runs as a
 * superuser, so RLS policies aren't exercised here — the triggers and
 * helper functions are.
 */
const db = new PGlite()
const NEW_USER = '11111111-1111-1111-1111-111111111111'
const ADMIN = '22222222-2222-2222-2222-222222222222'

async function as(uid: string | null) {
  await db.exec(`set test.uid = '${uid ?? ''}'`)
}

beforeAll(async () => {
  // Stand-ins for Supabase's auth/storage schemas.
  await db.exec(`
    create role authenticated; create role anon; create role service_role;
    create schema auth; create schema storage;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
    create table storage.objects (id uuid, bucket_id text, name text, owner uuid);
    create table storage.buckets (id text, public boolean);
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create function auth.role() returns text language sql stable
      as $$ select 'authenticated'::text $$;
    create function gen_random_bytes(int) returns bytea language sql
      as $$ select decode(md5(random()::text), 'hex') $$;
  `)
  const base = fs
    .readFileSync('db/00_base_schema.sql', 'utf8')
    .replace('create extension if not exists pgcrypto;', '')
  await db.exec(base)
  const hardening = fs.readFileSync('db/12_security_hardening.sql', 'utf8')
  await db.exec(hardening)
  await db.exec(hardening) // must be safe to re-run

  await db.exec(`
    insert into auth.users values
      ('${NEW_USER}', 'new@example.com', '{"full_name":"New Person"}'),
      ('${ADMIN}', 'admin@example.com', '{}');
    update profiles set role = 'admin' where id = '${ADMIN}';
  `)
}, 30_000)

describe('sign-up', () => {
  it('creates new accounts as pending', async () => {
    const { rows } = await db.query<{ role: string; full_name: string }>(
      `select role, full_name from profiles where id = '${NEW_USER}'`,
    )
    expect(rows[0]).toEqual({ role: 'pending', full_name: 'New Person' })
  })
})

describe('profiles_guard', () => {
  it('stops a user making themselves admin', async () => {
    await as(NEW_USER)
    await expect(
      db.exec(`update profiles set role = 'admin' where id = '${NEW_USER}'`),
    ).rejects.toThrow(/Only an admin/)
  })

  it('stops a user changing their own account status', async () => {
    await as(NEW_USER)
    await expect(
      db.exec(`update profiles set is_deleted = true where id = '${NEW_USER}'`),
    ).rejects.toThrow(/Only an admin/)
  })

  it('still lets users edit their own name', async () => {
    await as(NEW_USER)
    await db.exec(`update profiles set full_name = 'Renamed' where id = '${NEW_USER}'`)
    const { rows } = await db.query<{ full_name: string }>(
      `select full_name from profiles where id = '${NEW_USER}'`,
    )
    expect(rows[0].full_name).toBe('Renamed')
  })

  it('lets an admin approve someone', async () => {
    await as(NEW_USER)
    expect((await db.query<{ ok: boolean }>('select is_approved() ok')).rows[0].ok).toBe(false)

    await as(ADMIN)
    await db.exec(`update profiles set role = 'family' where id = '${NEW_USER}'`)

    await as(NEW_USER)
    expect((await db.query<{ ok: boolean }>('select is_approved() ok')).rows[0].ok).toBe(true)
  })
})

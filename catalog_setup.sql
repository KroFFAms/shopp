-- ==========================================================
-- KROFF onlayn katalog uchun Supabase jadvali
-- Bir marta ishga tushiring: Supabase -> SQL Editor -> shu kodni joylang -> Run
-- ==========================================================

create table if not exists public.catalog (
  id int primary key,
  data jsonb,
  updated_at timestamptz default now()
);

alter table public.catalog enable row level security;

-- Hammaga o'qish (onlayn katalog sayti uchun) — faqat tovar nomi/narx/qoldiq
drop policy if exists "catalog_read" on public.catalog;
create policy "catalog_read" on public.catalog
  for select to anon using (true);

-- KROFF ilovasi yozishi uchun (Katalogga yuklash tugmasi)
drop policy if exists "catalog_insert" on public.catalog;
create policy "catalog_insert" on public.catalog
  for insert to anon with check (true);

drop policy if exists "catalog_update" on public.catalog;
create policy "catalog_update" on public.catalog
  for update to anon using (true) with check (true);

-- Tekshirish uchun bo'sh boshlang'ich qator (ixtiyoriy)
insert into public.catalog (id, data) values (1, '[]'::jsonb)
  on conflict (id) do nothing;

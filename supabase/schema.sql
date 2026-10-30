-- Meme Radar tabloları + tarama tetikleyicisi. <PROJE_ID> yerine kendi Supabase proje ID'ni yaz.
create extension if not exists pg_net;

create table meme_scans (
  id bigint generated always as identity primary key,
  hours numeric, status text default 'queued', result jsonb, error text,
  created_at timestamptz default now(), finished_at timestamptz
);
create table meme_settings (
  id integer primary key default 1,
  min_mc numeric default 35000, min_liq numeric default 1000, max_mc_liq numeric default 15,
  min_tx_h1 integer default 150, updated_at timestamptz default now()
);
insert into meme_settings default values;
create table meme_trades (
  id bigint generated always as identity primary key,
  symbol text, mint text, image text, entry_mc numeric, size_usd numeric, exit_mc numeric, note text,
  opened_at timestamptz default now(), closed_at timestamptz
);
create table meme_wallets (wallet text primary key, info jsonb, fetched_at timestamptz default now());

alter table meme_scans enable row level security;
alter table meme_settings enable row level security;
alter table meme_trades enable row level security;
alter table meme_wallets enable row level security;

create or replace function meme_start(h numeric) returns bigint
language plpgsql security definer set search_path to 'public' as $$
declare new_id bigint;
begin
  insert into meme_scans (hours) values (least(greatest(h, 0.25), 6)) returning id into new_id;
  perform net.http_post(
    url := 'https://<PROJE_ID>.supabase.co/functions/v1/meme-scan',
    body := jsonb_build_object('id', new_id),
    timeout_milliseconds := 10000);
  return new_id;
end $$;

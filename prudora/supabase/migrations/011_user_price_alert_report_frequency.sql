-- Legger til frekvens for prisvarsler (umiddelbart/daglig/ukentlig).

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_price_alert_settings'
      and column_name = 'report_frequency'
  ) then
    alter table public.user_price_alert_settings
      add column report_frequency text not null default 'instant';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_price_alert_settings_report_frequency_check'
  ) then
    alter table public.user_price_alert_settings
      add constraint user_price_alert_settings_report_frequency_check
      check (report_frequency in ('instant', 'daily', 'weekly'));
  end if;
end $$;

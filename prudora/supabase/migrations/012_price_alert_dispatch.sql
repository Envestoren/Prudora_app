-- Sender push-varsler når prisregler treffer.
-- Innhold: produktnavn, gammel pris, ny pris, butikk og delta i prosent.

create extension if not exists pg_net;

create or replace function public.dispatch_price_alerts_for_price_row(p_price_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_price record;
  v_prev_price numeric;
  v_abs_drop numeric;
  v_pct_drop numeric;
  v_now timestamptz := now();
  v_title text;
  v_body text;
  v_freq text;
  v_last_sent timestamptz;
  v_has_filters boolean;
  v_token record;
  v_alert record;
begin
  select
    pp.id,
    pp.product_id,
    pp.store_id,
    pp.price_amount,
    pp.recorded_at,
    p.name as product_name,
    coalesce(s.chain || case when s.name is not null then ' - ' || s.name else '' end, s.chain) as store_label
  into v_price
  from public.product_prices pp
  join public.products p on p.id = pp.product_id
  join public.stores s on s.id = pp.store_id
  where pp.id = p_price_id
    and pp.approval_status = 'approved';

  if v_price.id is null then
    return;
  end if;

  select pp.price_amount
  into v_prev_price
  from public.product_prices pp
  where pp.product_id = v_price.product_id
    and pp.store_id = v_price.store_id
    and pp.approval_status = 'approved'
    and pp.recorded_at < v_price.recorded_at
  order by pp.recorded_at desc
  limit 1;

  if v_prev_price is null then
    return;
  end if;

  v_abs_drop := v_prev_price - v_price.price_amount;
  if v_prev_price > 0 then
    v_pct_drop := (v_abs_drop / v_prev_price) * 100;
  else
    v_pct_drop := null;
  end if;

  if v_abs_drop <= 0 then
    return;
  end if;

  for v_alert in
    select
      a.id as alert_id,
      a.user_id,
      a.percent_drop,
      a.absolute_drop_kr,
      a.threshold_price
    from public.user_product_price_alerts a
    where a.enabled = true
      and a.product_id = v_price.product_id
      and (
        (a.percent_drop is not null and v_pct_drop is not null and v_pct_drop >= a.percent_drop) or
        (a.absolute_drop_kr is not null and v_abs_drop >= a.absolute_drop_kr) or
        (a.threshold_price is not null and v_price.price_amount <= a.threshold_price)
      )
  loop
    if exists (
      select 1
      from public.user_price_alert_events e
      where e.alert_id = v_alert.alert_id
        and e.product_price_id = v_price.id
    ) then
      continue;
    end if;

    select exists (
      select 1 from public.user_price_alert_store_filters f where f.user_id = v_alert.user_id
    ) into v_has_filters;

    if v_has_filters and not exists (
      select 1
      from public.user_price_alert_store_filters f
      where f.user_id = v_alert.user_id
        and f.store_id = v_price.store_id
    ) then
      continue;
    end if;

    select coalesce(s.report_frequency, 'instant')
    into v_freq
    from public.user_price_alert_settings s
    where s.user_id = v_alert.user_id;
    v_freq := coalesce(v_freq, 'instant');

    if v_freq in ('daily', 'weekly') then
      select max(e.sent_at)
      into v_last_sent
      from public.user_price_alert_events e
      where e.alert_id = v_alert.alert_id;

      if v_last_sent is not null then
        if v_freq = 'daily' and v_last_sent > (v_now - interval '1 day') then
          continue;
        end if;
        if v_freq = 'weekly' and v_last_sent > (v_now - interval '7 day') then
          continue;
        end if;
      end if;
    end if;

    v_title := format('%s: prisnedgang', v_price.product_name);
    v_body := format(
      '%s | %s: %s kr -> %s kr (%s%s%%)',
      v_price.store_label,
      v_price.product_name,
      round(v_prev_price, 2),
      round(v_price.price_amount, 2),
      case when v_pct_drop >= 0 then '-' else '' end,
      round(abs(v_pct_drop), 1)
    );

    for v_token in
      select t.expo_push_token
      from public.user_push_tokens t
      where t.user_id = v_alert.user_id
    loop
      perform net.http_post(
        url := 'https://exp.host/--/api/v2/push/send',
        headers := '{"Content-Type":"application/json"}'::jsonb,
        body := jsonb_build_object(
          'to', v_token.expo_push_token,
          'sound', 'default',
          'title', v_title,
          'body', v_body,
          'data', jsonb_build_object(
            'product_id', v_price.product_id,
            'store_id', v_price.store_id,
            'product_price_id', v_price.id,
            'old_price', v_prev_price,
            'new_price', v_price.price_amount,
            'delta_percent', v_pct_drop
          )
        )
      );
    end loop;

    insert into public.user_price_alert_events (
      user_id,
      alert_id,
      product_id,
      store_id,
      product_price_id,
      sent_at
    )
    values (
      v_alert.user_id,
      v_alert.alert_id,
      v_price.product_id,
      v_price.store_id,
      v_price.id,
      now()
    )
    on conflict (alert_id, product_price_id) do nothing;
  end loop;
end;
$$;

create or replace function public.trg_dispatch_price_alerts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    if NEW.approval_status = 'approved' then
      perform public.dispatch_price_alerts_for_price_row(NEW.id);
    end if;
    return NEW;
  end if;

  if TG_OP = 'UPDATE' then
    if NEW.approval_status = 'approved' and OLD.approval_status is distinct from NEW.approval_status then
      perform public.dispatch_price_alerts_for_price_row(NEW.id);
    end if;
    return NEW;
  end if;

  return NEW;
end;
$$;

drop trigger if exists dispatch_price_alerts_on_product_prices on public.product_prices;
create trigger dispatch_price_alerts_on_product_prices
after insert or update of approval_status on public.product_prices
for each row
execute function public.trg_dispatch_price_alerts();

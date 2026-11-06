-- 0011 · pg_cron. На локальном Postgres без pg_cron миграция безопасна (skip).
-- UTC, ≤8 параллельных задач, ≤10 мин на задачу (docs/05-database.md §10).
set search_path = public;

do $$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    begin
      execute 'create extension if not exists pg_cron with schema pg_catalog';
    exception when others then
      raise notice 'pg_cron недоступен (%); расписания пропущены', sqlerrm;
      return;
    end;
  end if;

  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise notice 'pg_cron недоступен; расписания пропущены';
    return;
  end if;

  -- Любая ошибка регистрации расписаний не должна ломать накат миграций.
  begin
    if to_regprocedure('cron.unschedule(text)') is not null and to_regclass('cron.job') is not null then
      perform cron.unschedule(jobname) from cron.job
        where jobname in ('daily-quests','supply-drops','seed-rotation','battle-timeouts','chat-cleanup');
    end if;

    perform cron.schedule('daily-quests', '5 0 * * *', 'select public.reset_daily_quests()');
    perform cron.schedule('supply-drops', '*/5 * * * *', 'select public.process_supply_drops()');
    perform cron.schedule('seed-rotation', '0 3 * * *', 'select public.rotate_server_seeds()');
    perform cron.schedule('battle-timeouts', '* * * * *', 'select public.cancel_expired_battles()');
    perform cron.schedule('chat-cleanup', '0 4 * * *',
      'delete from public.chat_messages where created_at < now() - interval ''30 days''');
  exception when others then
    raise notice 'pg_cron: расписания не зарегистрированы (%); задать вручную', sqlerrm;
  end;
end
$$;

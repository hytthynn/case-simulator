/**
 * Сгенерированные типы Supabase.
 * Получаются командой `pnpm --filter @case-sim/db types` после `supabase start`.
 * На этапе 1 файл-заглушка нужен, чтобы `tsc` и CI не падали на пустом пакете;
 * НЕ редактировать вручную, CI проверяет отсутствие диффа.
 */
export type Database = Record<string, never>;
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

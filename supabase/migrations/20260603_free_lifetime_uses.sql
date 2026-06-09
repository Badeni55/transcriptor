-- free_lifetime_uses — contador de los 5 «Hazlo mío» de por vida del plan free.
-- Aplicada a prod (proyecto reelscript) 2026-06-03 vía MCP. v0.19.
-- Sin esta columna el muro de los 5 free no persiste (lee 0 -> free ilimitado).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS free_lifetime_uses INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.profiles.free_lifetime_uses IS
  'Contador de los 5 «Hazlo mío» de por vida del plan free (no resetea). v0.19.';

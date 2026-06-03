-- scripts.alt_hooks — hooks alternativos del guion (R4).
-- Aplicada a prod (proyecto reelscript) 2026-06-03 vía MCP.
-- El hook activo vive en scripts.*; alt_hooks guarda las variantes (swap sin perder nada).

ALTER TABLE public.scripts
  ADD COLUMN IF NOT EXISTS alt_hooks JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.scripts.alt_hooks IS
  'Hooks alternativos del guion (R4). El activo es scripts.* / el array guarda variantes. v0.19+.';

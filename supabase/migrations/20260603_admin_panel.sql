-- 1.1. Extensión profiles.is_admin (BOOLEAN)
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;

COMMENT ON COLUMN profiles.is_admin IS 'Flag de administrador. Si true, el usuario puede acceder a /admin. Se puede alternar vía endpoint admin.';

-- 1.2. Tabla plans (configuración de planes DB-driven con fallback a PLANS env)
CREATE TABLE IF NOT EXISTS plans (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price_month_cents INTEGER,
  price_year_cents INTEGER,
  monthly_credits INTEGER,
  stripe_price_month TEXT,
  stripe_price_year TEXT,
  features JSONB DEFAULT '{}',
  active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE plans IS 'Matriz de planes (free/creator/agency/pro legacy). Acceso: service_role solo. El frontend lee vía /admin/api/plans (servidor actúa como proxy). Si tabla vacía o error DB → fallback a PLANS env.';

-- RLS: deshabilitar (service_role solo; sin policies públicas)
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;

-- 1.3. Tabla topups (configuración de recarga de créditos)
CREATE TABLE IF NOT EXISTS topups (
  key TEXT PRIMARY KEY,
  credits INTEGER NOT NULL,
  price_cents INTEGER NOT NULL,
  stripe_price_id TEXT,
  active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE topups IS 'Topups de créditos one-time (100/300/1000). Acceso: service_role solo. Frontend lee vía /admin/api/topups. Fallback a TOPUPS env si falla.';

ALTER TABLE topups ENABLE ROW LEVEL SECURITY;

-- 1.4. Tabla app_settings (configuración global de app)
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE app_settings IS 'Ajustes globales (COST_CENTS, flags, etc.). Clave: "cost_cents" → {"value": 18}. Acceso: service_role solo.';

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- 1.5. SEED: valores actuales v0.19 (ON CONFLICT DO NOTHING).
--   Los stripe_price_* arrancan NULL: se rellenan desde el panel admin (/admin -> Planes/Topups).
INSERT INTO plans (key, name, price_month_cents, price_year_cents, monthly_credits, stripe_price_month, stripe_price_year, active, sort_order) VALUES
  ('free',    'Free',          NULL,  NULL,   0,   NULL, NULL, true,  1),
  ('creator', 'Creator',       2900,  27600,  100, NULL, NULL, true,  2),
  ('agency',  'Agency',        12900, 129000, 500, NULL, NULL, true,  3),
  ('pro',     'Pro (Legacy)',  NULL,  NULL,   50,  NULL, NULL, false, 4)
ON CONFLICT DO NOTHING;

INSERT INTO topups (key, credits, price_cents, stripe_price_id, active, sort_order) VALUES
  ('100',  100,  1900,  NULL, true, 1),
  ('300',  300,  4900,  NULL, true, 2),
  ('1000', 1000, 13900, NULL, true, 3)
ON CONFLICT DO NOTHING;

INSERT INTO app_settings (key, value) VALUES
  ('cost_cents', '{"value": 18}')
ON CONFLICT DO NOTHING;

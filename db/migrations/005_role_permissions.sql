-- 005 — Matrice rôles × permissions (modifiable sans changer le code)
INSERT INTO role_permissions (role, permission) VALUES
  ('admin_clinique','patient:read'), ('admin_clinique','patient:write'),
  ('admin_clinique','appointment:read'), ('admin_clinique','appointment:write'),
  ('admin_clinique','consultation:read'), ('admin_clinique','consultation:write'),
  ('admin_clinique','diagnosis:read'),
  ('admin_clinique','invoice:read'), ('admin_clinique','invoice:write'),
  ('admin_clinique','payment:write'),
  ('admin_clinique','user:manage'),
  ('medecin','patient:read'),
  ('medecin','appointment:read'), ('medecin','appointment:write'),
  ('medecin','consultation:read'), ('medecin','consultation:write'),
  ('medecin','diagnosis:read'),
  ('secretaire','patient:read'), ('secretaire','patient:write'),
  ('secretaire','appointment:read'), ('secretaire','appointment:write'),
  ('caissier','patient:read'),
  ('caissier','invoice:read'), ('caissier','invoice:write'),
  ('caissier','payment:write'),
  ('agent_assureur','invoice:read'),
  ('patient','appointment:read')
ON CONFLICT DO NOTHING;

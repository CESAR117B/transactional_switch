-- ==========================================================================
-- Permiso para que la App administradora registre nuevas apps
-- (endpoint POST /admin/apps → cmd RPC 'crear_app')
--
-- Idempotente: usa WHERE NOT EXISTS porque 'cmp' NO tiene índice único.
-- Correrlo contra la BD del microservicio (PostgreSQL).
-- ==========================================================================

-- 1. Servicio del panel administrativo
INSERT INTO servicios (nombre, codigo, descripcion, activo)
SELECT 'Administración', 'ADMIN_REGISTER_APP', 'Funciones administrativas del panel', true
WHERE NOT EXISTS (
  SELECT 1 FROM servicios WHERE codigo = 'ADMIN_REGISTER_APP'
);

-- 2. Controlador / comando
INSERT INTO controladores (cmp, descripcion)
SELECT 'registrar_app', 'Alta de nuevas apps consumidoras del microservicio'
WHERE NOT EXISTS (
  SELECT 1 FROM controladores WHERE cmp = 'registrar_app'
);

-- 3. Relación servicio ↔ controlador
INSERT INTO servicios_controladores (id_servicio, id_controlador)
SELECT s.id_servicio, c.id_controlador
FROM servicios s, controladores c
WHERE s.codigo = 'ADMIN_REGISTER_APP'
  AND c.cmp = 'registrar_app'
  AND NOT EXISTS (
    SELECT 1 FROM servicios_controladores sc
    WHERE sc.id_servicio = s.id_servicio
      AND sc.id_controlador = c.id_controlador
  );

-- 4. Asignación del servicio a la App administradora.
--    ⚠️ Cambiá 'TU_APP_ADMIN' por el identificador_app real de tu app admin.
INSERT INTO app_servicios (id_app, id_servicio)
SELECT a.id_app, s.id_servicio
FROM app a, servicios s
WHERE a.identificador_app = 'TU_APP_ADMIN'
  AND s.codigo = 'ADMIN_REGISTER_APP'
  AND NOT EXISTS (
    SELECT 1 FROM app_servicios aps
    WHERE aps.id_app = a.id_app AND aps.id_servicio = s.id_servicio
  );

-- NOTA: el JWT (1h) carga permisos/servicios al hacer login → después de
-- correr esto, volvé a hacer POST /auth/login con la app admin para que el
-- token ya traiga el servicio ADMIN_REGISTER_APP y el cmd 'registrar_app'.

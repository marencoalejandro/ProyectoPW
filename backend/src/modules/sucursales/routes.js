import { Router } from 'express';
import { pool } from '../../db/pool.js';
import { isAdminCentral, requireAuth } from '../../middleware/auth.js';

const router = Router();

// GET /sucursales → sedes que el usuario puede consultar.
// Administración central y RR. HH. ven todas; el resto, solo la propia.
router.get('/', requireAuth, async (req, res) => {
  const todas = isAdminCentral(req.user) || req.user.rol === 'RRHH';
  const { rows } = await pool.query(
    `SELECT id, nombre, direccion, activa FROM sucursales
     WHERE ($1::boolean OR id = $2) ORDER BY id`,
    [todas, req.user.sucursalId],
  );
  res.json({ items: rows });
});

export default router;

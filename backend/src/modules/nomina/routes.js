import { Router } from 'express';
import { forbidden } from '../../lib/errors.js';
import { isAdminCentral, requireAuth, requireRole } from '../../middleware/auth.js';
import * as c from './controller.js';

// Planilla: solo RR. HH. y administración central.
function requirePlanilla(req, _res, next) {
  if (req.user.rol === 'RRHH' || isAdminCentral(req.user)) return next();
  next(forbidden('Solo RR. HH. y la administración central acceden a la planilla.'));
}

// Alta y edición de personal: RR. HH. y administración central.
const requireGestionPersonal = requirePlanilla;

const router = Router();
router.use(['/empleados', '/planillas'], requireAuth);

router.get('/empleados', requireRole('ADMIN', 'RRHH'), c.listarEmpleados);
router.get('/empleados/:id', requireRole('ADMIN', 'RRHH'), c.obtenerEmpleado);
router.post('/empleados', requireGestionPersonal, c.crearEmpleado);
router.put('/empleados/:id', requireGestionPersonal, c.actualizarEmpleado);

router.get('/planillas', requirePlanilla, c.consultarPlanilla);
router.post('/planillas', requirePlanilla, c.generarPlanilla);

export default router;

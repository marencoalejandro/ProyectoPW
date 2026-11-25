import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import * as c from './controller.js';

const router = Router();
router.use(requireAuth, requireRole('ADMIN', 'EMPLEADO'));

router.post('/', c.registrar);
router.get('/', c.listar);
router.get('/:id', c.obtener);
// Anular exige un supervisor: gerente de la sucursal o administración central.
router.post('/:id/anulacion', requireRole('ADMIN'), c.anular);

export default router;

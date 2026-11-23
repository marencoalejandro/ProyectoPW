import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import * as controller from './controller.js';

// Directorio fiscal global (CCF). Lo usan caja y administración; RR. HH. no.
const router = Router();
router.use(requireAuth, requireRole('ADMIN', 'EMPLEADO'));

router.get('/', controller.listar);
router.get('/:id', controller.obtener);
router.post('/', controller.crear);
router.put('/:id', controller.actualizar);

export default router;

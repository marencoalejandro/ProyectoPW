import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import * as c from './controller.js';

const router = Router();
router.use(requireAuth, requireRole('ADMIN', 'EMPLEADO'));

router.post('/', c.abrir);
router.get('/actual', c.actual);
router.get('/', requireRole('ADMIN'), c.listar);
router.get('/:id', c.obtener);
router.post('/:id/cierre', c.cerrar);

export default router;

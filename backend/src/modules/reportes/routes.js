import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import * as c from './controller.js';

// Reportes de ventas: gerencia (su sucursal) y administración central.
const router = Router();
router.use(requireAuth, requireRole('ADMIN'));

router.get('/ventas', c.ventas);
router.get('/productos', c.productos);

export default router;

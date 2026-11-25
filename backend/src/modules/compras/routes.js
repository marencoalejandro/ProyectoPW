import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import * as c from './controller.js';

// Compras y cuentas por pagar: gerencia de cada sucursal y administración central.
const router = Router();
router.use(['/proveedores', '/compras'], requireAuth, requireRole('ADMIN'));

router.get('/proveedores', c.listarProveedores);
router.post('/proveedores', c.crearProveedor);
router.put('/proveedores/:id', c.actualizarProveedor);

router.get('/compras', c.listarCompras);
router.post('/compras', c.registrarCompra);
router.get('/compras/:id', c.obtenerCompra);
router.put('/compras/:id/pago', c.registrarPago);

export default router;

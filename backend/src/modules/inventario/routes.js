import { Router } from 'express';
import { requireAdminCentral, requireAuth, requireRole } from '../../middleware/auth.js';
import * as c from './controller.js';

// Menú, insumos y recetas son catálogos centrales: los modifica solo la
// administración central. El stock es por sucursal.
const router = Router();
router.use(['/platillos', '/insumos', '/inventario'], requireAuth);

router.get('/platillos', c.listarPlatillos);
router.get('/platillos/:id', c.obtenerPlatillo);
router.get('/platillos/:id/receta', c.obtenerReceta);
router.post('/platillos', requireAdminCentral, c.crearPlatillo);
router.put('/platillos/:id', requireAdminCentral, c.actualizarPlatillo);
router.put('/platillos/:id/receta', requireAdminCentral, c.reemplazarReceta);

router.get('/insumos', requireRole('ADMIN', 'EMPLEADO'), c.listarInsumos);
router.post('/insumos', requireAdminCentral, c.crearInsumo);
router.put('/insumos/:id', requireAdminCentral, c.actualizarInsumo);

router.get('/inventario', requireRole('ADMIN', 'EMPLEADO'), c.listarStock);
router.get('/inventario/alertas', requireRole('ADMIN', 'EMPLEADO'), c.listarAlertas);
router.get('/inventario/movimientos', requireRole('ADMIN'), c.listarMovimientos);
router.post('/inventario/ajustes', requireRole('ADMIN'), c.ajustarStock);
router.put('/inventario/:insumoId', requireRole('ADMIN'), c.actualizarStockMinimo);

export default router;

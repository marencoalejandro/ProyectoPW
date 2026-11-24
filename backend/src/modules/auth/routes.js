import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { issueCsrfToken } from '../../middleware/csrf.js';
import { loginLimiter, refreshLimiter } from '../../middleware/rateLimit.js';
import * as controller from './controller.js';

// Contrato que ya consume frontend/src/api/authApi.js.
// El CSRF de las escrituras se valida en app.js para toda la API.
const router = Router();

router.get('/csrf', issueCsrfToken);
router.post('/login', loginLimiter, controller.login);
router.post('/refresh', refreshLimiter, controller.refresh);
router.get('/me', requireAuth, controller.me);
router.post('/logout', controller.logout);

export default router;

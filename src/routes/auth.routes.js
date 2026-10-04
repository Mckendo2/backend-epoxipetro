const express = require('express');
const router = express.Router();
const authCtrl = require('../controllers/auth.controller');
const { verificarToken } = require('../middlewares/auth.middleware');

router.post('/login', authCtrl.login);
router.get('/me', verificarToken, authCtrl.getMe);

// Rutas de configuración inicial (primer uso del sistema)
router.get('/setup', authCtrl.checkSetup);
router.post('/setup/admin', authCtrl.registerAdmin);

module.exports = router;

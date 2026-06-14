const express = require('express');
const router = express.Router();
const authCtrl = require('../controllers/auth.controller');

router.post('/login', authCtrl.login);

// Rutas de configuración inicial (primer uso del sistema)
router.get('/setup', authCtrl.checkSetup);
router.post('/setup/admin', authCtrl.registerAdmin);

module.exports = router;

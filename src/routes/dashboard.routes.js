const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/dashboard.controller');

router.get('/estadisticas', ctrl.obtenerEstadisticas);
router.get('/ganancia-productos', ctrl.gananciaLiquidaProductos);

module.exports = router;

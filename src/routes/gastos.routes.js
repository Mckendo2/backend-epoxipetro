const express = require('express');
const router = express.Router();
const gastosController = require('../controllers/gastos.controller');

// Rutas base: /api/gastos
router.post('/', gastosController.crearGasto);
router.get('/', gastosController.obtenerGastos);

module.exports = router;

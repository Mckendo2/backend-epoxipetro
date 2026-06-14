const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/cotizaciones.controller');

router.get('/', ctrl.obtenerCotizaciones);
router.get('/:id', ctrl.obtenerCotizacionDetalle);
router.post('/', ctrl.crearCotizacion);

module.exports = router;

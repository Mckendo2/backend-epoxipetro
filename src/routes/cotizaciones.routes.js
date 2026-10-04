const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/cotizaciones.controller');

router.get('/', ctrl.obtenerCotizaciones);
router.get('/:id', ctrl.obtenerCotizacionDetalle);
router.post('/', ctrl.crearCotizacion);
router.put('/:id/anular', ctrl.anularCotizacion);

module.exports = router;

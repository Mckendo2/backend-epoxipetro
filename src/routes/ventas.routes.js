const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/ventas.controller');

router.get('/clientes',    ctrl.obtenerClientes);
router.get('/',            ctrl.obtenerVentas);
router.get('/:id',         ctrl.obtenerVentaDetalle);
router.post('/',           ctrl.registrarVenta);
router.post('/:id/anular', ctrl.anularVenta);
router.post('/:id/cobrar', ctrl.cobrarVenta);
router.post('/:id/abono',  ctrl.registrarAbono);
router.post('/desde-cotizacion/:id', ctrl.convertirCotizacion);

module.exports = router;

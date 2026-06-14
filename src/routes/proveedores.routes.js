const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/proveedores.controller');

router.get('/kpis',                  ctrl.obtenerKpis);
router.get('/pagos',                 ctrl.obtenerPagos);
router.get('/compras',               ctrl.obtenerCompras);
router.post('/compras',              ctrl.registrarCompra);
router.post('/compras/:id/pagar',    ctrl.registrarPago);
router.get('/',                      ctrl.obtenerProveedores);
router.post('/',                     ctrl.crearProveedor);
router.put('/:id',                   ctrl.editarProveedor);

module.exports = router;

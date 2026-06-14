const express = require('express');
const router = express.Router();
const reportesController = require('../controllers/reportes.controller');

router.get('/desempeno-vendedores', reportesController.desempenoVendedores);
router.get('/mejores-clientes', reportesController.mejoresClientes);
router.get('/ventas-por-dia', reportesController.ventasPorDia);
router.get('/inventario-valorizado', reportesController.inventarioValorizado);

module.exports = router;

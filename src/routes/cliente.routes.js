const express = require('express');
const router = express.Router();
const { obtenerTodos, crearCliente } = require('../controllers/cliente.controller');

router.get('/', obtenerTodos);
router.post('/', crearCliente);

module.exports = router;

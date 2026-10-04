const express = require('express');
const router = express.Router();
const { obtenerTodos, crearCliente, editarCliente, eliminarCliente } = require('../controllers/cliente.controller');

router.get('/', obtenerTodos);
router.post('/', crearCliente);
router.put('/:id', editarCliente);
router.delete('/:id', eliminarCliente);

module.exports = router;

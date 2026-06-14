const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/roles.controller');

router.get('/', ctrl.obtenerRoles);
router.get('/:id', ctrl.obtenerRol);
router.post('/', ctrl.crearRol);
router.put('/:id', ctrl.actualizarRol);
router.delete('/:id', ctrl.eliminarRol);

module.exports = router;

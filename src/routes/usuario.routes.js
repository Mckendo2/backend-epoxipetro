const express = require('express');
const router = express.Router();
const { obtenerUsuarios, crearUsuario, cambiarEstado, obtenerPerfil, cambiarContrasena } = require('../controllers/usuario.controller');

router.get('/perfil', obtenerPerfil);
router.put('/perfil/contrasena', cambiarContrasena);
router.get('/', obtenerUsuarios);
router.post('/', crearUsuario);
router.put('/:id/estado', cambiarEstado);

module.exports = router;

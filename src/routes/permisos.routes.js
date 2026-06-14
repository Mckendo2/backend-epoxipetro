const express = require('express');
const router = express.Router();
const permisosCtrl = require('../controllers/permisos.controller');

router.get('/', permisosCtrl.getAllPermisos);
router.get('/rol/:rol_id', permisosCtrl.getPermisosByRol);
router.post('/rol/:rol_id', permisosCtrl.updatePermisosRol);

module.exports = router;

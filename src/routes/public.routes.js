const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/public.controller');

router.get('/catalogo', ctrl.obtenerCatalogoPublico);

module.exports = router;

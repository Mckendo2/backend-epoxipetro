const express = require('express');
const router = express.Router();
const auditoriaCtrl = require('../controllers/auditoria.controller');

router.get('/kpis', auditoriaCtrl.getKpis);
router.get('/', auditoriaCtrl.getLogs);

module.exports = router;

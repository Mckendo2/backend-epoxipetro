const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const ctrl    = require('../controllers/proveedores.controller');

const fs = require('fs');
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir)
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, 'compra-' + uniqueSuffix + path.extname(file.originalname))
  }
});
const upload = multer({ storage: storage });

router.get('/kpis',                  ctrl.obtenerKpis);
router.get('/pagos',                 ctrl.obtenerPagos);
router.get('/compras',               ctrl.obtenerCompras);
router.get('/compras/:id/items',     ctrl.obtenerItemsCompra);
router.post('/compras', (req, res, next) => {
  upload.any()(req, res, function (err) {
    if (err) {
      console.error('Error de subida (Multer):', err);
      return res.status(500).json({ mensaje: 'Error de servidor al subir archivo', error: err.message || err.toString() });
    }
    next();
  });
}, ctrl.registrarCompra);
router.post('/compras/:id/pagar',    ctrl.registrarPago);
router.post('/compras/:id/recepcion', ctrl.registrarRecepcion);
router.post('/compras/:id/devolucion', ctrl.registrarDevolucionCompra);
router.get('/',                      ctrl.obtenerProveedores);
router.post('/',                     ctrl.crearProveedor);
router.put('/:id',                   ctrl.editarProveedor);

module.exports = router;

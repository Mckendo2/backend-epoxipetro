const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');

const upload = multer({ storage: multer.memoryStorage() });

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/')
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, uniqueSuffix + path.extname(file.originalname))
  }
});
const uploadImage = multer({ storage: storage });

const ctrl = require('../controllers/inventario.controller');

router.get('/catalogos',                  ctrl.obtenerCatalogos);
router.post('/categorias',                ctrl.crearCategoria);
router.put('/categorias/:id',             ctrl.editarCategoria);
router.delete('/categorias/:id',          ctrl.eliminarCategoria);
router.post('/marcas',                    ctrl.crearMarca);
router.put('/marcas/:id',                 ctrl.editarMarca);
router.delete('/marcas/:id',              ctrl.eliminarMarca);
router.get('/productos',                  ctrl.obtenerProductos);
router.post('/productos',                 uploadImage.single('imagen'), ctrl.crearProducto);
router.put('/productos/:id',              uploadImage.single('imagen'), ctrl.editarProducto);
router.post('/presentaciones',            ctrl.crearPresentacion);
router.put('/presentaciones/:id',         ctrl.editarPresentacion);
router.get('/scanner/:codigo',            ctrl.buscarPorCodigo);
router.post('/movimientos/entrada-almacen', ctrl.entradaAlmacen);
router.post('/movimientos/traslado-tienda', ctrl.trasladarATienda);
router.get('/movimientos',                ctrl.obtenerMovimientos);

// Rutas para Excel
router.get('/exportar-plantilla',         ctrl.exportarExcel);
router.post('/importar-excel',            upload.single('file'), ctrl.importarExcel);

module.exports = router;

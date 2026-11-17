const pool = require('../config/db');

exports.obtenerCatalogoPublico = async (req, res) => {
  try {
    const [filas] = await pool.query(`
      SELECT
        p.id, p.nombre, p.descripcion, p.imagen_url,
        c.nombre AS categoria, m.nombre AS marca,
        pr.id AS presentacion_id,
        pr.nombre AS presentacion_nombre,
        pr.codigo_barras, pr.sku,
        pr.precio_venta,
        u.abreviatura AS unidad,
        COALESCE(it.cantidad, 0) AS stock_tienda,
        COALESCE(ia.cantidad, 0) AS stock_almacen,
        (COALESCE(it.cantidad, 0) + COALESCE(ia.cantidad, 0)) AS stock_total
      FROM productos p
      LEFT JOIN categorias c ON p.categoria_id = c.id
      LEFT JOIN marcas m ON p.marca_id = m.id
      JOIN presentaciones pr ON pr.producto_id = p.id
      LEFT JOIN unidades_medida u ON pr.unidad_medida_id = u.id
      LEFT JOIN inventario_tienda it ON it.presentacion_id = pr.id
      LEFT JOIN inventario_almacen ia ON ia.presentacion_id = pr.id
      WHERE p.estado = true AND pr.estado = 1
      ORDER BY p.nombre, pr.cantidad_unidad
    `);

    // Agrupar presentaciones bajo el producto padre
    const mapa = {};
    filas.forEach(f => {
      if (!mapa[f.id]) {
        mapa[f.id] = {
          id: f.id, 
          nombre: f.nombre, 
          descripcion: f.descripcion,
          categoria: f.categoria || 'General', 
          marca: f.marca || 'Sin marca', 
          imagen_url: f.imagen_url,
          presentaciones: []
        };
      }
      mapa[f.id].presentaciones.push({
        id: f.presentacion_id,
        nombre: f.presentacion_nombre,
        codigo_barras: f.codigo_barras,
        sku: f.sku,
        precio_venta: Number(f.precio_venta || 0),
        unidad: f.unidad,
        stock_tienda: Number(f.stock_tienda || 0),
        stock_almacen: Number(f.stock_almacen || 0),
        stock_total: Number(f.stock_total || 0)
      });
    });

    res.json(Object.values(mapa));
  } catch (error) {
    console.error('Error al obtener catálogo público:', error);
    res.status(500).json({ mensaje: 'Error al obtener catálogo' });
  }
};

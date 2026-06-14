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
        COALESCE(it.cantidad, 0) AS stock_tienda
      FROM productos p
      LEFT JOIN categorias c ON p.categoria_id = c.id
      LEFT JOIN marcas m ON p.marca_id = m.id
      JOIN presentaciones pr ON pr.producto_id = p.id
      LEFT JOIN unidades_medida u ON pr.unidad_medida_id = u.id
      LEFT JOIN inventario_tienda it ON it.presentacion_id = pr.id
      WHERE p.estado = true
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
          categoria: f.categoria, 
          marca: f.marca, 
          imagen_url: f.imagen_url,
          presentaciones: []
        };
      }
      mapa[f.id].presentaciones.push({
        id: f.presentacion_id,
        nombre: f.presentacion_nombre,
        codigo_barras: f.codigo_barras,
        sku: f.sku,
        precio_venta: f.precio_venta,
        unidad: f.unidad,
        stock_tienda: f.stock_tienda
      });
    });

    res.json(Object.values(mapa));
  } catch (error) {
    console.error('Error al obtener catálogo público:', error);
    res.status(500).json({ mensaje: 'Error al obtener catálogo' });
  }
};

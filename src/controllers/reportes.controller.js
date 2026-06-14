const pool = require('../config/db');

exports.desempenoVendedores = async (req, res) => {
  try {
    const { fechaInicio, fechaFin } = req.query;
    if (!fechaInicio || !fechaFin) {
      return res.status(400).json({ mensaje: 'Las fechas de inicio y fin son obligatorias' });
    }

    const start = `${fechaInicio} 00:00:00`;
    const end = `${fechaFin} 23:59:59`;

    const [filas] = await pool.query(`
      SELECT 
        u.nombre AS vendedor,
        r.nombre AS rol,
        COUNT(v.id) AS total_ventas,
        SUM(v.total) AS ingresos_generados,
        SUM(v.descuento) AS total_descuentos
      FROM ventas v
      JOIN usuarios u ON v.usuario_id = u.id
      JOIN roles r ON u.rol_id = r.id
      WHERE v.estado = 'completada' AND v.created_at BETWEEN ? AND ?
      GROUP BY u.id
      ORDER BY ingresos_generados DESC
    `, [start, end]);

    res.json(filas);
  } catch (error) {
    console.error('Error obteniendo desempeño de vendedores:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor al obtener reportes' });
  }
};

exports.mejoresClientes = async (req, res) => {
  try {
    const { fechaInicio, fechaFin } = req.query;
    if (!fechaInicio || !fechaFin) return res.status(400).json({ mensaje: 'Fechas obligatorias' });

    const start = `${fechaInicio} 00:00:00`;
    const end = `${fechaFin} 23:59:59`;

    const [filas] = await pool.query(`
      SELECT 
        c.nombre,
        c.apellido,
        c.documento,
        COUNT(v.id) AS total_compras,
        SUM(v.total) AS total_gastado
      FROM ventas v
      JOIN clientes c ON v.cliente_id = c.id
      WHERE v.estado = 'completada' AND v.created_at BETWEEN ? AND ?
      GROUP BY c.id
      ORDER BY total_gastado DESC
      LIMIT 50
    `, [start, end]);

    res.json(filas);
  } catch (error) {
    console.error('Error obteniendo mejores clientes:', error);
    res.status(500).json({ mensaje: 'Error al obtener reportes' });
  }
};

exports.ventasPorDia = async (req, res) => {
  try {
    const { fechaInicio, fechaFin } = req.query;
    if (!fechaInicio || !fechaFin) return res.status(400).json({ mensaje: 'Fechas obligatorias' });

    const start = `${fechaInicio} 00:00:00`;
    const end = `${fechaFin} 23:59:59`;

    const [filas] = await pool.query(`
      SELECT 
        DATE(DATE_SUB(v.created_at, INTERVAL 4 HOUR)) AS fecha,
        COUNT(v.id) AS cantidad_ventas,
        SUM(v.total) AS total_ingresos,
        SUM(v.descuento) AS total_descuentos
      FROM ventas v
      WHERE v.estado = 'completada' AND v.created_at BETWEEN ? AND ?
      GROUP BY DATE(DATE_SUB(v.created_at, INTERVAL 4 HOUR))
      ORDER BY fecha ASC
    `, [start, end]);

    res.json(filas);
  } catch (error) {
    console.error('Error obteniendo ventas por dia:', error);
    res.status(500).json({ mensaje: 'Error al obtener reportes' });
  }
};

exports.inventarioValorizado = async (req, res) => {
  try {
    const [filas] = await pool.query(`
      SELECT 
        p.nombre AS producto,
        pr.nombre AS presentacion,
        c.nombre AS categoria,
        pr.precio_compra,
        pr.precio_venta,
        IFNULL(ia.cantidad, 0) AS stock_almacen,
        IFNULL(it.cantidad, 0) AS stock_tienda,
        (IFNULL(ia.cantidad, 0) + IFNULL(it.cantidad, 0)) AS stock_total,
        ((IFNULL(ia.cantidad, 0) + IFNULL(it.cantidad, 0)) * pr.precio_compra) AS valor_invertido,
        ((IFNULL(ia.cantidad, 0) + IFNULL(it.cantidad, 0)) * pr.precio_venta) AS valor_venta_proyectado
      FROM productos p
      JOIN presentaciones pr ON p.id = pr.producto_id
      LEFT JOIN categorias c ON p.categoria_id = c.id
      LEFT JOIN inventario_almacen ia ON pr.id = ia.presentacion_id
      LEFT JOIN inventario_tienda it ON pr.id = it.presentacion_id
      WHERE (IFNULL(ia.cantidad, 0) + IFNULL(it.cantidad, 0)) > 0
      ORDER BY valor_invertido DESC
    `);

    res.json(filas);
  } catch (error) {
    console.error('Error obteniendo inventario valorizado:', error);
    res.status(500).json({ mensaje: 'Error al obtener reportes' });
  }
};

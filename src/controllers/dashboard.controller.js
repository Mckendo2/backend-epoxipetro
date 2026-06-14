const pool = require('../config/db');

exports.obtenerEstadisticas = async (req, res) => {
  try {
    const { fechaInicio, fechaFin } = req.query;

    if (!fechaInicio || !fechaFin) {
      return res.status(400).json({ mensaje: 'Las fechas de inicio y fin son obligatorias' });
    }

    const start = `${fechaInicio} 00:00:00`;
    const end = `${fechaFin} 23:59:59`;

    // 1. KPIs
    const [[kpis]] = await pool.query(`
      SELECT 
        COUNT(id) as totalVentas,
        SUM(total) as ingresos,
        COUNT(DISTINCT cliente_id) as clientesActivos
      FROM ventas
      WHERE estado = 'completada' AND created_at BETWEEN ? AND ?
    `, [start, end]);

    const [[cuentasCobrar]] = await pool.query(`
      SELECT SUM(total - COALESCE((SELECT SUM(monto) FROM pagos_venta WHERE venta_id = ventas.id), 0)) as totalPendiente
      FROM ventas
      WHERE tipo_venta = 'credito' AND estado_pago = 'pendiente' AND estado = 'completada'
      AND created_at BETWEEN ? AND ?
    `, [start, end]);

    const [[deudaProveedores]] = await pool.query(`
      SELECT COALESCE(SUM(
        cp.monto - COALESCE((SELECT SUM(pp.monto) FROM pagos_proveedor pp WHERE pp.compra_id = cp.id), 0)
      ), 0) AS total
      FROM compras_proveedor cp
      WHERE cp.estado_pago IN ('pendiente', 'parcial')
    `);

    // 2. Tendencia de Ventas (agrupado por fecha local de Bolivia UTC-4)
    const [tendencias] = await pool.query(`
      SELECT 
        DATE(DATE_SUB(created_at, INTERVAL 4 HOUR)) as fecha,
        SUM(total) as total
      FROM ventas
      WHERE estado = 'completada' AND created_at BETWEEN ? AND ?
      GROUP BY DATE(DATE_SUB(created_at, INTERVAL 4 HOUR))
      ORDER BY fecha ASC
    `, [start, end]);

    // 3. Top Categorías
    const [topCategorias] = await pool.query(`
      SELECT 
        IFNULL(c.nombre, 'Sin categoría') as categoria, 
        SUM(dv.cantidad) as cantidad
      FROM detalle_ventas dv
      JOIN ventas v ON dv.venta_id = v.id
      JOIN presentaciones pr ON dv.presentacion_id = pr.id
      JOIN productos p ON pr.producto_id = p.id
      LEFT JOIN categorias c ON p.categoria_id = c.id
      WHERE v.estado = 'completada' AND v.created_at BETWEEN ? AND ?
      GROUP BY c.nombre
      ORDER BY cantidad DESC
      LIMIT 6
    `, [start, end]);

    // 4. Top 10 Productos Más Vendidos
    const [topProductos] = await pool.query(`
      SELECT 
        p.nombre AS producto,
        pr.nombre AS presentacion,
        SUM(dv.cantidad) as cantidad
      FROM detalle_ventas dv
      JOIN ventas v ON dv.venta_id = v.id
      JOIN presentaciones pr ON dv.presentacion_id = pr.id
      JOIN productos p ON pr.producto_id = p.id
      WHERE v.estado = 'completada' AND v.created_at BETWEEN ? AND ?
      GROUP BY pr.id
      ORDER BY cantidad DESC
      LIMIT 10
    `, [start, end]);

    res.json({
      kpis: {
        totalVentas: kpis.totalVentas || 0,
        ingresos: parseFloat(kpis.ingresos || 0),
        clientesActivos: kpis.clientesActivos || 0,
        cuentasPorCobrar: parseFloat(cuentasCobrar.totalPendiente || 0),
        deudaProveedores: parseFloat(deudaProveedores.total || 0)
      },
      tendencias: tendencias.map(t => ({
        fecha: t.fecha,
        total: parseFloat(t.total || 0)
      })),
      topCategorias: topCategorias.map(c => ({
        categoria: c.categoria,
        cantidad: parseInt(c.cantidad || 0)
      })),
      topProductos: topProductos.map(p => ({
        nombre: (p.presentacion === 'Unidad' || p.presentacion === 'General') ? p.producto : `${p.producto} - ${p.presentacion}`,
        cantidad: parseInt(p.cantidad || 0)
      }))
    });
  } catch (error) {
    console.error('Error obteniendo estadísticas del dashboard:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor al obtener estadísticas' });
  }
};

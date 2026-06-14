const pool = require('../config/db');

exports.obtenerCotizaciones = async (req, res) => {
  try {
    const limite = parseInt(req.query.limite) || 50;
    const [filas] = await pool.query(`
      SELECT c.id, c.total, c.adelanto, c.saldo, c.estado, c.created_at,
             CONCAT(cl.nombre, ' ', COALESCE(cl.apellido,'')) AS cliente,
             u.nombre AS usuario,
             COUNT(dc.id) AS cantidad_items
      FROM cotizaciones c
      LEFT JOIN clientes cl ON c.cliente_id = cl.id
      LEFT JOIN usuarios u ON c.usuario_id = u.id
      LEFT JOIN detalle_cotizaciones dc ON dc.cotizacion_id = c.id
      GROUP BY c.id
      ORDER BY c.created_at DESC
      LIMIT ?
    `, [limite]);
    res.json(filas);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al obtener cotizaciones' });
  }
};

exports.obtenerCotizacionDetalle = async (req, res) => {
  try {
    const { id } = req.params;
    const [[cotizacion]] = await pool.query(`
      SELECT c.*, CONCAT(cl.nombre, ' ', COALESCE(cl.apellido,'')) AS cliente, u.nombre AS usuario
      FROM cotizaciones c
      LEFT JOIN clientes cl ON c.cliente_id = cl.id
      LEFT JOIN usuarios u ON c.usuario_id = u.id
      WHERE c.id = ?
    `, [id]);

    if (!cotizacion) return res.status(404).json({ mensaje: 'Cotización no encontrada' });

    const [detalle] = await pool.query(`
      SELECT dc.*, pr.nombre AS presentacion, p.nombre AS producto,
             um.abreviatura AS unidad
      FROM detalle_cotizaciones dc
      JOIN presentaciones pr ON dc.presentacion_id = pr.id
      JOIN productos p ON pr.producto_id = p.id
      LEFT JOIN unidades_medida um ON pr.unidad_medida_id = um.id
      WHERE dc.cotizacion_id = ?
    `, [id]);

    res.json({ ...cotizacion, detalle });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al obtener detalle de la cotización' });
  }
};

exports.crearCotizacion = async (req, res) => {
  let connection;
  try {
    const { cliente_id, total, adelanto, carrito } = req.body;
    const usuario_id = req.usuario.id;
    const saldo = parseFloat(total) - parseFloat(adelanto || 0);

    if (!carrito || carrito.length === 0) {
      return res.status(400).json({ mensaje: 'El carrito está vacío' });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    // 1. Crear la cotización
    const [resultCotizacion] = await connection.query(`
      INSERT INTO cotizaciones (cliente_id, usuario_id, total, adelanto, saldo, estado)
      VALUES (?, ?, ?, ?, ?, 'pendiente')
    `, [cliente_id || null, usuario_id, total, adelanto || 0, saldo]);

    const cotizacion_id = resultCotizacion.insertId;

    // 2. Insertar detalles (no descontamos de inventario)
    for (const item of carrito) {
      const subtotal = item.cantidad * item.precio;
      await connection.query(`
        INSERT INTO detalle_cotizaciones (cotizacion_id, presentacion_id, cantidad, precio_unitario, subtotal)
        VALUES (?, ?, ?, ?, ?)
      `, [cotizacion_id, item.presentacion_id, item.cantidad, item.precio, subtotal]);
    }

    await connection.commit();
    res.status(201).json({ mensaje: 'Cotización creada exitosamente', cotizacion_id });

  } catch (error) {
    if (connection) await connection.rollback();
    console.error('Error al crear cotización:', error);
    res.status(500).json({ mensaje: 'Error al registrar la cotización' });
  } finally {
    if (connection) connection.release();
  }
};

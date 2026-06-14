const pool = require('../config/db');

// GET /api/ventas — historial de ventas
exports.obtenerVentas = async (req, res) => {
  try {
    const limite = parseInt(req.query.limite) || 50;
    const [filas] = await pool.query(`
      SELECT v.id, v.total, v.descuento, v.metodo_pago, v.estado, v.nota, v.created_at,
             v.tipo_venta, v.estado_pago,
             CONCAT(c.nombre, ' ', COALESCE(c.apellido,'')) AS cliente,
             u.nombre AS usuario,
             COUNT(dv.id) AS cantidad_items,
             (SELECT COALESCE(SUM(monto), 0) FROM pagos_venta WHERE venta_id = v.id) AS monto_pagado
      FROM ventas v
      LEFT JOIN clientes c ON v.cliente_id = c.id
      LEFT JOIN usuarios u ON v.usuario_id = u.id
      LEFT JOIN detalle_ventas dv ON dv.venta_id = v.id
      GROUP BY v.id
      ORDER BY v.created_at DESC
      LIMIT ?
    `, [limite]);
    res.json(filas.map(f => ({ ...f, saldo_pendiente: parseFloat(f.total) - parseFloat(f.monto_pagado) })));
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al obtener ventas' });
  }
};

// GET /api/ventas/:id — detalle de una venta
exports.obtenerVentaDetalle = async (req, res) => {
  try {
    const { id } = req.params;
    const [[venta]] = await pool.query(`
      SELECT v.*, CONCAT(c.nombre, ' ', COALESCE(c.apellido,'')) AS cliente, u.nombre AS usuario
      FROM ventas v
      LEFT JOIN clientes c ON v.cliente_id = c.id
      LEFT JOIN usuarios u ON v.usuario_id = u.id
      WHERE v.id = ?
    `, [id]);

    if (!venta) return res.status(404).json({ mensaje: 'Venta no encontrada' });

    const [detalle] = await pool.query(`
      SELECT dv.*, pr.nombre AS presentacion, p.nombre AS producto,
             um.abreviatura AS unidad
      FROM detalle_ventas dv
      JOIN presentaciones pr ON dv.presentacion_id = pr.id
      JOIN productos p ON pr.producto_id = p.id
      LEFT JOIN unidades_medida um ON pr.unidad_medida_id = um.id
      WHERE dv.venta_id = ?
    `, [id]);

    res.json({ ...venta, detalle });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al obtener detalle de la venta' });
  }
};

// POST /api/ventas — registrar venta
exports.registrarVenta = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { cliente_id, usuario_id, metodo_pago, nota, descuento = 0, items, tipo_venta = 'contado' } = req.body;
    
    const estado_pago = tipo_venta === 'credito' ? 'pendiente' : 'pagado';

    // Validaciones básicas
    if (!items || items.length === 0) {
      return res.status(400).json({ mensaje: 'La venta debe tener al menos un producto' });
    }

    await conn.beginTransaction();

    // Obtener tipo de movimiento para venta
    const [[tm]] = await conn.query(`SELECT id FROM tipos_movimiento WHERE codigo = 'salida_venta'`);
    if (!tm) {
      await conn.rollback();
      return res.status(500).json({ mensaje: 'Tipo de movimiento "salida_venta" no configurado' });
    }

    let totalCalculado = 0;

    // Verificar stock y preparar movimientos
    for (const item of items) {
      const { presentacion_id, cantidad, precio_unitario } = item;

      if (!presentacion_id || !cantidad || cantidad <= 0 || !precio_unitario) {
        await conn.rollback();
        return res.status(400).json({ mensaje: 'Cada ítem debe tener presentacion_id, cantidad y precio_unitario' });
      }

      // Verificar stock disponible en tienda
      const [[stockRow]] = await conn.query(
        `SELECT it.cantidad, pr.nombre FROM inventario_tienda it
         JOIN presentaciones pr ON it.presentacion_id = pr.id
         WHERE it.presentacion_id = ?`,
        [presentacion_id]
      );

      if (!stockRow) {
        await conn.rollback();
        return res.status(400).json({ mensaje: `Presentación ${presentacion_id} no tiene stock en tienda` });
      }

      if (parseFloat(stockRow.cantidad) < cantidad) {
        await conn.rollback();
        return res.status(400).json({
          mensaje: `Stock insuficiente: "${stockRow.nombre}" solo tiene ${stockRow.cantidad} disponibles en tienda`
        });
      }

      totalCalculado += parseFloat(precio_unitario) * parseFloat(cantidad);
    }

    const totalFinal = totalCalculado - parseFloat(descuento);

    // Insertar cabecera de venta
    const [resultVenta] = await conn.query(
      `INSERT INTO ventas (cliente_id, usuario_id, total, descuento, metodo_pago, nota, tipo_venta, estado_pago)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [cliente_id || null, usuario_id || null, totalFinal, descuento, metodo_pago || 'efectivo', nota || null, tipo_venta, estado_pago]
    );
    const venta_id = resultVenta.insertId;

    // Insertar detalle y mover stock
    for (const item of items) {
      const { presentacion_id, cantidad, precio_unitario } = item;
      const subtotal = parseFloat(precio_unitario) * parseFloat(cantidad);

      // Insertar línea de detalle
      await conn.query(
        `INSERT INTO detalle_ventas (venta_id, presentacion_id, cantidad, precio_unitario, subtotal)
         VALUES (?, ?, ?, ?, ?)`,
        [venta_id, presentacion_id, cantidad, precio_unitario, subtotal]
      );

      // Obtener stock antes para el audit log
      const [[it]] = await conn.query(`SELECT cantidad FROM inventario_tienda WHERE presentacion_id = ?`, [presentacion_id]);
      const [[ia]] = await conn.query(`SELECT cantidad FROM inventario_almacen WHERE presentacion_id = ?`, [presentacion_id]);

      // Registrar movimiento de salida
      await conn.query(
        `INSERT INTO movimientos_stock (tipo_movimiento_id, presentacion_id, cantidad, stock_tienda_antes, stock_almacen_antes, usuario_id, nota)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [tm.id, presentacion_id, cantidad, it?.cantidad ?? 0, ia?.cantidad ?? 0, usuario_id || null, `Venta #${venta_id}`]
      );

      // Descontar stock de tienda
      await conn.query(
        `UPDATE inventario_tienda SET cantidad = cantidad - ? WHERE presentacion_id = ?`,
        [cantidad, presentacion_id]
      );
    }

    await conn.commit();
    res.status(201).json({ mensaje: 'Venta registrada exitosamente', id: venta_id, total: totalFinal });
  } catch (error) {
    await conn.rollback();
    console.error(error);
    res.status(500).json({ mensaje: 'Error al registrar la venta' });
  } finally {
    conn.release();
  }
};

// POST /api/ventas/:id/anular — anular venta y revertir stock
exports.anularVenta = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { id } = req.params;

    await conn.beginTransaction();

    const [[venta]] = await conn.query(`SELECT * FROM ventas WHERE id = ?`, [id]);
    if (!venta) { await conn.rollback(); return res.status(404).json({ mensaje: 'Venta no encontrada' }); }
    if (venta.estado === 'anulada') { await conn.rollback(); return res.status(400).json({ mensaje: 'La venta ya está anulada' }); }

    const [detalle] = await conn.query(`SELECT * FROM detalle_ventas WHERE venta_id = ?`, [id]);

    // Revertir stock
    for (const item of detalle) {
      await conn.query(
        `UPDATE inventario_tienda SET cantidad = cantidad + ? WHERE presentacion_id = ?`,
        [item.cantidad, item.presentacion_id]
      );
    }

    await conn.query(`UPDATE ventas SET estado = 'anulada' WHERE id = ?`, [id]);
    await conn.commit();

    res.json({ mensaje: 'Venta anulada y stock revertido' });
  } catch (error) {
    await conn.rollback();
    console.error(error);
    res.status(500).json({ mensaje: 'Error al anular la venta' });
  } finally {
    conn.release();
  }
};

// POST /api/ventas/:id/cobrar — cobrar deuda de venta a crédito
exports.cobrarVenta = async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await pool.query(
      `UPDATE ventas SET estado_pago = 'pagado' WHERE id = ? AND tipo_venta = 'credito' AND estado_pago = 'pendiente'`,
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(400).json({ mensaje: 'La venta no se puede cobrar (no existe o ya está pagada)' });
    }

    res.json({ mensaje: 'Deuda cobrada exitosamente' });
  } catch (error) {
    console.error('Error al cobrar venta:', error);
    res.status(500).json({ mensaje: 'Error al cobrar la venta' });
  }
};

// POST /api/ventas/:id/abono
exports.registrarAbono = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { id } = req.params;
    const { monto, metodo_pago, nota } = req.body;
    
    if (!monto || monto <= 0) return res.status(400).json({ mensaje: 'Monto inválido' });
    if (!metodo_pago) return res.status(400).json({ mensaje: 'Método de pago obligatorio' });

    await conn.beginTransaction();

    const [[venta]] = await conn.query('SELECT total, estado_pago FROM ventas WHERE id = ?', [id]);
    if (!venta) {
      await conn.rollback();
      return res.status(404).json({ mensaje: 'Venta no encontrada' });
    }
    if (venta.estado_pago === 'pagado') {
      await conn.rollback();
      return res.status(400).json({ mensaje: 'Esta venta ya está completamente pagada' });
    }

    // Registrar el abono
    await conn.query(
      'INSERT INTO pagos_venta (venta_id, monto, metodo_pago, nota) VALUES (?, ?, ?, ?)',
      [id, monto, metodo_pago, nota || null]
    );

    // Revisar si ya se cubrió el total
    const [[pagos]] = await conn.query('SELECT SUM(monto) AS total_pagado FROM pagos_venta WHERE venta_id = ?', [id]);
    
    if (parseFloat(pagos.total_pagado) >= parseFloat(venta.total)) {
      await conn.query("UPDATE ventas SET estado_pago = 'pagado' WHERE id = ?", [id]);
    }

    await conn.commit();
    res.json({ mensaje: 'Abono registrado exitosamente', total_pagado: pagos.total_pagado });
  } catch (error) {
    await conn.rollback();
    console.error(error);
    res.status(500).json({ mensaje: 'Error al registrar el abono' });
  } finally {
    conn.release();
  }
};

exports.obtenerClientes = async (req, res) => {
  try {
    const [filas] = await pool.query(
      `SELECT id, nombre, apellido, telefono FROM clientes ORDER BY nombre`
    );
    res.json(filas);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al obtener clientes' });
  }
};

// POST /api/ventas/desde-cotizacion/:id
exports.convertirCotizacion = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { id } = req.params;
    const { usuario_id, metodo_pago = 'efectivo' } = req.body;

    await conn.beginTransaction();

    // 1. Obtener la cotización
    const [[cotizacion]] = await conn.query('SELECT * FROM cotizaciones WHERE id = ?', [id]);
    if (!cotizacion) {
      await conn.rollback();
      return res.status(404).json({ mensaje: 'Cotización no encontrada' });
    }
    if (cotizacion.estado !== 'pendiente') {
      await conn.rollback();
      return res.status(400).json({ mensaje: 'La cotización ya fue procesada o anulada' });
    }

    // 2. Obtener los detalles de la cotización
    const [detalles] = await conn.query('SELECT * FROM detalle_cotizaciones WHERE cotizacion_id = ?', [id]);

    // 3. Crear la venta
    const [resultVenta] = await conn.query(
      `INSERT INTO ventas (cliente_id, usuario_id, total, descuento, metodo_pago, nota, tipo_venta, estado_pago)
       VALUES (?, ?, ?, 0, ?, ?, 'contado', 'pagado')`,
      [cotizacion.cliente_id, usuario_id || cotizacion.usuario_id, cotizacion.total, metodo_pago, `Venta generada desde la cotización #${id}`]
    );
    const venta_id = resultVenta.insertId;

    // Obtener tipo de movimiento
    const [[tm]] = await conn.query(`SELECT id FROM tipos_movimiento WHERE codigo = 'salida_venta'`);

    // 4. Mover stock e insertar detalles de venta
    for (const item of detalles) {
      const { presentacion_id, cantidad, precio_unitario, subtotal } = item;

      // Verificar stock
      const [[stockRow]] = await conn.query(
        `SELECT it.cantidad, pr.nombre FROM inventario_tienda it
         JOIN presentaciones pr ON it.presentacion_id = pr.id
         WHERE it.presentacion_id = ?`,
        [presentacion_id]
      );

      if (!stockRow || parseFloat(stockRow.cantidad) < parseFloat(cantidad)) {
        await conn.rollback();
        return res.status(400).json({
          mensaje: `Stock insuficiente para procesar la cotización: "${stockRow?.nombre || presentacion_id}"`
        });
      }

      // Insertar detalle de venta
      await conn.query(
        `INSERT INTO detalle_ventas (venta_id, presentacion_id, cantidad, precio_unitario, subtotal)
         VALUES (?, ?, ?, ?, ?)`,
        [venta_id, presentacion_id, cantidad, precio_unitario, subtotal]
      );

      // Obtener stock antes para el audit log
      const [[it]] = await conn.query(`SELECT cantidad FROM inventario_tienda WHERE presentacion_id = ?`, [presentacion_id]);
      const [[ia]] = await conn.query(`SELECT cantidad FROM inventario_almacen WHERE presentacion_id = ?`, [presentacion_id]);

      // Registrar movimiento
      await conn.query(
        `INSERT INTO movimientos_stock (tipo_movimiento_id, presentacion_id, cantidad, stock_tienda_antes, stock_almacen_antes, usuario_id, nota)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [tm?.id || null, presentacion_id, cantidad, it?.cantidad ?? 0, ia?.cantidad ?? 0, usuario_id || cotizacion.usuario_id, `Cotización #${id} cobrada`]
      );

      // Descontar stock
      await conn.query(
        `UPDATE inventario_tienda SET cantidad = cantidad - ? WHERE presentacion_id = ?`,
        [cantidad, presentacion_id]
      );
    }

    // 5. Marcar cotización como completada
    await conn.query(`UPDATE cotizaciones SET estado = 'completada' WHERE id = ?`, [id]);

    await conn.commit();
    res.status(201).json({ mensaje: 'Cotización convertida a venta exitosamente', venta_id });

  } catch (error) {
    await conn.rollback();
    console.error('Error al convertir cotización:', error);
    res.status(500).json({ mensaje: 'Error al convertir la cotización a venta' });
  } finally {
    conn.release();
  }
};

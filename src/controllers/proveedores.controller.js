const pool = require('../config/db');

// Condición SQL exacta para notas de movimientos de una compra.
// Evita que "Orden de compra #1%" coincida también con #10, #11, #100…
const condNotaCompra = (prefijo, id) => ({
  sql: '(ms.nota = ? OR ms.nota LIKE ?)',
  params: [`${prefijo}${id}`, `${prefijo}${id} - %`]
});

// ─── GET /api/proveedores ────────────────────────────────────────────────────
// Lista todos los proveedores con su deuda pendiente actual
exports.obtenerProveedores = async (req, res) => {
  try {
    const [filas] = await pool.query(`
      SELECT
        p.id, p.nombre, p.contacto, p.telefono, p.correo,
        p.direccion, p.ruc_nit, p.activo, p.created_at,
        COALESCE(
          SUM(
            CASE WHEN cp.estado_pago IN ('pendiente','parcial')
              THEN cp.monto - COALESCE((
                SELECT SUM(pp.monto) FROM pagos_proveedor pp WHERE pp.compra_id = cp.id
              ), 0)
            ELSE 0 END
          ), 0
        ) AS deuda_pendiente
      FROM proveedores p
      LEFT JOIN compras_proveedor cp ON cp.proveedor_id = p.id
      GROUP BY p.id
      ORDER BY p.nombre ASC
    `);
    res.json(filas.map(f => ({ ...f, deuda_pendiente: parseFloat(f.deuda_pendiente) })));
  } catch (error) {
    console.error('Error al obtener proveedores:', error);
    res.status(500).json({ mensaje: 'Error interno al obtener proveedores' });
  }
};

// ─── POST /api/proveedores ───────────────────────────────────────────────────
exports.crearProveedor = async (req, res) => {
  try {
    const { nombre, contacto, telefono, correo, direccion, ruc_nit } = req.body;
    if (!nombre) return res.status(400).json({ mensaje: 'El nombre del proveedor es obligatorio' });

    const [resultado] = await pool.query(
      `INSERT INTO proveedores (nombre, contacto, telefono, correo, direccion, ruc_nit)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [nombre, contacto || null, telefono || null, correo || null, direccion || null, ruc_nit || null]
    );
    res.status(201).json({ mensaje: 'Proveedor creado exitosamente', id: resultado.insertId });
  } catch (error) {
    console.error('Error al crear proveedor:', error);
    res.status(500).json({ mensaje: 'Error interno al crear proveedor' });
  }
};

// ─── PUT /api/proveedores/:id ────────────────────────────────────────────────
exports.editarProveedor = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, contacto, telefono, correo, direccion, ruc_nit, activo } = req.body;
    if (!nombre) return res.status(400).json({ mensaje: 'El nombre es obligatorio' });

    const [resultado] = await pool.query(
      `UPDATE proveedores SET nombre=?, contacto=?, telefono=?, correo=?, direccion=?, ruc_nit=?, activo=?
       WHERE id=?`,
      [nombre, contacto || null, telefono || null, correo || null, direccion || null, ruc_nit || null,
       activo !== undefined ? activo : true, id]
    );
    if (resultado.affectedRows === 0) return res.status(404).json({ mensaje: 'Proveedor no encontrado' });
    res.json({ mensaje: 'Proveedor actualizado exitosamente' });
  } catch (error) {
    console.error('Error al editar proveedor:', error);
    res.status(500).json({ mensaje: 'Error interno al editar proveedor' });
  }
};

// ─── GET /api/proveedores/compras ────────────────────────────────────────────
exports.obtenerCompras = async (req, res) => {
  try {
    const [filas] = await pool.query(`
      SELECT
        cp.id, cp.descripcion, cp.monto, cp.tipo_pago, cp.estado_pago,
        cp.fecha_vencimiento, cp.nota, cp.created_at,
        p.nombre AS proveedor,
        p.id     AS proveedor_id,
        u.nombre AS usuario,
        COALESCE((SELECT SUM(pp.monto) FROM pagos_proveedor pp WHERE pp.compra_id = cp.id), 0) AS monto_pagado,
        (SELECT MAX(pp.created_at) FROM pagos_proveedor pp WHERE pp.compra_id = cp.id) AS ultimo_pago
      FROM compras_proveedor cp
      JOIN proveedores p ON cp.proveedor_id = p.id
      LEFT JOIN usuarios u ON cp.usuario_id = u.id
      ORDER BY cp.created_at DESC
      LIMIT 200
    `);
    res.json(filas.map(f => {
      const monto       = parseFloat(f.monto);
      const montoPagado = parseFloat(f.monto_pagado);
      const esPagado    = f.estado_pago === 'pagado';
      return {
        ...f,
        monto,
        monto_pagado:     esPagado ? monto : montoPagado,
        saldo_pendiente:  esPagado ? 0     : Math.max(0, monto - montoPagado),
      };
    }));
  } catch (error) {
    console.error('Error al obtener compras:', error);
    res.status(500).json({ mensaje: 'Error interno al obtener compras' });
  }
};

// ─── GET /api/proveedores/compras/:id/items ──────────────────────────────────
exports.obtenerItemsCompra = async (req, res) => {
  try {
    const { id } = req.params;
    const [items] = await pool.query(`
      SELECT 
        ms.cantidad,
        ms.nota,
        p.id AS presentacion_id,
        p.precio_compra,
        COALESCE(prod.nombre, '(producto eliminado)') AS producto_nombre,
        COALESCE(p.nombre, '(eliminado)')             AS presentacion_nombre,
        p.codigo_barras
      FROM movimientos_stock ms
      LEFT JOIN presentaciones p ON ms.presentacion_id = p.id
      LEFT JOIN productos prod ON p.producto_id = prod.id
      WHERE ${condNotaCompra('Orden de compra #', parseInt(id)).sql}
    `, condNotaCompra('Orden de compra #', parseInt(id)).params);

    res.json(items);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al obtener los ítems de la compra' });
  }
};

// ─── POST /api/proveedores/compras ───────────────────────────────────────────
// Acepta: { proveedor_id, tipo_pago, nota, fecha_vencimiento, items: [...] }
// Cada item puede ser:
//   - Existente: { presentacion_id, precio_compra, precio_venta, cantidad }
//   - Nuevo:     { nombre, presentacion_nombre?, categoria_id?, codigo_barras?,
//                  precio_compra, precio_venta, cantidad }
exports.registrarCompra = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    let data = req.body;
    if (req.body.datos) {
      data = JSON.parse(req.body.datos);
    }
    const { proveedor_id, tipo_pago = 'credito', nota, numero_nota, fecha_vencimiento, items = [] } = data;

    if (!proveedor_id) return res.status(400).json({ mensaje: 'Proveedor obligatorio' });
    if (!items || items.length === 0) return res.status(400).json({ mensaje: 'Debes agregar al menos un ítem' });

    await conn.beginTransaction();

    // 1. Calcular monto total
    let montoTotal = 0;
    for (const item of items) {
      montoTotal += parseFloat(item.precio_compra || 0) * parseFloat(item.cantidad || 0);
    }

    const estado_pago = tipo_pago === 'contado' ? 'pagado' : 'pendiente';

    // 2. Registrar la cabecera de la compra
    // created_at explícito para que se registre en hora de Bolivia (igual que ventas)
    const [resCompra] = await conn.query(
      `INSERT INTO compras_proveedor
        (proveedor_id, descripcion, monto, tipo_pago, estado_pago, fecha_vencimiento, nota, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        proveedor_id,
        numero_nota ? numero_nota : `Orden de compra — ${items.length} ítem(s)`,
        montoTotal,
        tipo_pago,
        estado_pago,
        fecha_vencimiento || null,
        nota || null,
        new Date()
      ]
    );

    const compra_id = resCompra.insertId;

    if (tipo_pago === 'contado' && montoTotal > 0) {
      await conn.query(
        `INSERT INTO pagos_proveedor (compra_id, monto, metodo_pago, nota, created_at) VALUES (?, ?, 'efectivo', 'Pago automático (Compra al contado)', ?)`,
        [compra_id, montoTotal, new Date()]
      );
    }

    // 3. Obtener tipo de movimiento "entrada_almacen"
    const [[tm]] = await conn.query(`SELECT id FROM tipos_movimiento WHERE codigo = 'entrada_almacen'`);

    // 3. Registrar ítems
    for (const [index, item] of items.entries()) {
      const cantidad    = parseFloat(item.cantidad || 0);
      const precioComp  = parseFloat(item.precio_compra || 0);
      const precioVenta = parseFloat(item.precio_venta || 0);
      if (cantidad <= 0) continue;

      let presentacion_id = item.presentacion_id || null;

      if (!presentacion_id) {
        // — Producto nuevo: crear producto y presentación —
        const nombreProd = (item.nombre || '').trim();
        const nombrePres = (item.presentacion_nombre || 'Unidad').trim();
        if (!nombreProd) continue;

        let producto_id = null;
        if (item.modo === 'buscar' && item.presentacion_id) {
          const [existeProd] = await conn.query(
            'SELECT p.id FROM productos p JOIN presentaciones_producto pp ON pp.producto_id = p.id WHERE pp.id = ?',
            [item.presentacion_id]
          );
          if (existeProd.length === 0) throw new Error(`Presentación ${item.presentacion_id} no encontrada`);
          producto_id = existeProd[0].id;
        } else {
          const [existeProd] = await conn.query(
            'SELECT id FROM productos WHERE nombre = ? LIMIT 1', [nombreProd]
          );
          if (existeProd.length > 0) {
            producto_id = existeProd[0].id;
          } else {
            // Buscar archivo de imagen para este nuevo item
            let imagen_url = null;
            if (req.files && req.files.length > 0) {
              const file = req.files.find(f => f.fieldname === `imagen_item_${index}`);
              if (file) imagen_url = `/uploads/${file.filename}`;
            }

            const [resProd] = await conn.query(
              'INSERT INTO productos (nombre, categoria_id, marca_id, imagen_url) VALUES (?, ?, ?, ?)',
              [nombreProd, item.categoria_id || null, item.marca_id || null, imagen_url]
            );
            producto_id = resProd.insertId;
          }
        }

        // ── Buscar presentación existente para evitar duplicados ──────────────
        // 1) Por código de barras (más específico)
        if (!presentacion_id && item.codigo_barras) {
          const [existePres] = await conn.query(
            'SELECT id FROM presentaciones WHERE codigo_barras = ? LIMIT 1',
            [item.codigo_barras]
          );
          if (existePres.length > 0) presentacion_id = existePres[0].id;
        }
        // 2) Por nombre de presentación dentro del mismo producto
        if (!presentacion_id && producto_id) {
          const [existePres] = await conn.query(
            'SELECT id FROM presentaciones WHERE producto_id = ? AND nombre = ? LIMIT 1',
            [producto_id, nombrePres]
          );
          if (existePres.length > 0) presentacion_id = existePres[0].id;
        }

        if (presentacion_id) {
          // Presentación ya existe → solo actualizar precios
          await conn.query(
            'UPDATE presentaciones SET precio_compra = ?, precio_venta = ? WHERE id = ?',
            [precioComp, precioVenta, presentacion_id]
          );
        } else {
          // Presentación nueva → crearla junto con sus filas de inventario
          const [resPres] = await conn.query(
            `INSERT INTO presentaciones
               (producto_id, nombre, codigo_barras, precio_compra, precio_venta, cantidad_unidad)
             VALUES (?, ?, ?, ?, ?, 1)`,
            [producto_id, nombrePres, item.codigo_barras || null, precioComp, precioVenta]
          );
          presentacion_id = resPres.insertId;

          await conn.query(
            'INSERT INTO inventario_tienda (presentacion_id, cantidad, cantidad_minima) VALUES (?, 0, ?)',
            [presentacion_id, item.cantidad_minima || 0]
          );
          await conn.query(
            'INSERT INTO inventario_almacen (presentacion_id, cantidad) VALUES (?, 0)',
            [presentacion_id]
          );
        }
      } else {
        // — Producto existente: solo actualizar precios —
        await conn.query(
          'UPDATE presentaciones SET precio_compra = ?, precio_venta = ? WHERE id = ?',
          [precioComp, precioVenta, presentacion_id]
        );
      }

      // Obtener stock actual para el log del movimiento
      const [[stockActual]] = await conn.query(
        `SELECT ia.cantidad AS almacen, COALESCE(it.cantidad, 0) AS tienda
         FROM inventario_almacen ia
         LEFT JOIN inventario_tienda it ON it.presentacion_id = ia.presentacion_id
         WHERE ia.presentacion_id = ?`,
        [presentacion_id]
      );

      // Registrar movimiento de stock
      await conn.query(
        `INSERT INTO movimientos_stock
           (tipo_movimiento_id, presentacion_id, cantidad, stock_tienda_antes, stock_almacen_antes, nota)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          tm.id, presentacion_id, cantidad,
          stockActual?.tienda ?? 0,
          stockActual?.almacen ?? 0,
          `Orden de compra #${compra_id}${item.nota ? ' - ' + item.nota : ''}`
        ]
      );

      // Sumar stock al almacén
      await conn.query(
        'UPDATE inventario_almacen SET cantidad = cantidad + ? WHERE presentacion_id = ?',
        [cantidad, presentacion_id]
      );
    }

    await conn.commit();
    res.status(201).json({
      mensaje: 'Orden de compra registrada exitosamente',
      id: resCompra.insertId,
      total: montoTotal
    });
  } catch (error) {
    await conn.rollback();
    console.error('Error al registrar orden de compra:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ mensaje: 'El código de barras ya está en uso por otro producto' });
    }
    res.status(500).json({ mensaje: 'Error interno al registrar la compra', error: error.message || error.toString() });
  } finally {
    conn.release();
  }
};

// ─── POST /api/proveedores/compras/:id/pagar ─────────────────────────────────
exports.registrarPago = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { id } = req.params;
    const { monto, metodo_pago = 'efectivo', nota } = req.body;

    if (!monto || monto <= 0) return res.status(400).json({ mensaje: 'Monto inválido' });

    await conn.beginTransaction();

    const [[compra]] = await conn.query(
      `SELECT monto, estado_pago FROM compras_proveedor WHERE id = ?`, [id]
    );
    if (!compra) {
      await conn.rollback();
      return res.status(404).json({ mensaje: 'Compra no encontrada' });
    }
    if (compra.estado_pago === 'pagado') {
      await conn.rollback();
      return res.status(400).json({ mensaje: 'Esta compra ya está completamente pagada' });
    }

    // created_at explícito para que el pago quede en hora de Bolivia
    await conn.query(
      `INSERT INTO pagos_proveedor (compra_id, monto, metodo_pago, nota, created_at) VALUES (?, ?, ?, ?, ?)`,
      [id, monto, metodo_pago, nota || null, new Date()]
    );

    const [[pagos]] = await conn.query(
      `SELECT SUM(monto) AS total_pagado FROM pagos_proveedor WHERE compra_id = ?`, [id]
    );
    const totalPagado = parseFloat(pagos.total_pagado || 0);
    const totalCompra = parseFloat(compra.monto);

    let nuevoEstado = 'parcial';
    if (totalPagado >= totalCompra) nuevoEstado = 'pagado';

    await conn.query(
      `UPDATE compras_proveedor SET estado_pago = ? WHERE id = ?`, [nuevoEstado, id]
    );

    await conn.commit();
    res.json({ mensaje: 'Pago registrado exitosamente', total_pagado: totalPagado, estado: nuevoEstado });
  } catch (error) {
    await conn.rollback();
    console.error('Error al registrar pago:', error);
    res.status(500).json({ mensaje: 'Error interno al registrar pago' });
  } finally {
    conn.release();
  }
};

// ─── GET /api/proveedores/kpis ───────────────────────────────────────────────
exports.obtenerKpis = async (req, res) => {
  try {
    const [[deuda]] = await pool.query(`
      SELECT
        COALESCE(SUM(
          cp.monto - COALESCE((
            SELECT SUM(pp.monto) FROM pagos_proveedor pp WHERE pp.compra_id = cp.id
          ), 0)
        ), 0) AS deuda_total,
        COUNT(*) AS compras_pendientes
      FROM compras_proveedor cp
      WHERE cp.estado_pago IN ('pendiente', 'parcial')
    `);

    const [[activos]] = await pool.query(
      `SELECT COUNT(*) AS total FROM proveedores WHERE activo = TRUE`
    );

    res.json({
      deuda_total:         parseFloat(deuda.deuda_total),
      compras_pendientes:  parseInt(deuda.compras_pendientes),
      proveedores_activos: parseInt(activos.total)
    });
  } catch (error) {
    console.error('Error al obtener KPIs de proveedores:', error);
    res.status(500).json({ mensaje: 'Error interno al obtener KPIs' });
  }
};

// ─── GET /api/proveedores/pagos ──────────────────────────────────────────────
exports.obtenerPagos = async (req, res) => {
  try {
    const [filas] = await pool.query(`
      SELECT
        pp.id, pp.monto, pp.metodo_pago, pp.nota, pp.created_at,
        cp.descripcion AS compra_descripcion,
        cp.monto       AS compra_monto,
        pr.nombre      AS proveedor
      FROM pagos_proveedor pp
      JOIN compras_proveedor cp ON pp.compra_id = cp.id
      JOIN proveedores pr ON cp.proveedor_id = pr.id
      ORDER BY pp.created_at DESC
      LIMIT 200
    `);
    res.json(filas.map(f => ({ ...f, monto: parseFloat(f.monto), compra_monto: parseFloat(f.compra_monto) })));
  } catch (error) {
    console.error('Error al obtener pagos:', error);
    res.status(500).json({ mensaje: 'Error interno al obtener pagos' });
  }
};

// ─── POST /api/proveedores/compras/:id/recepcion ─────────────────────────────
// Agrega más ítems/cantidades a una orden de compra existente y sube el stock
exports.registrarRecepcion = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;
    const { items = [] } = req.body;

    if (!items.length) {
      return res.status(400).json({ mensaje: 'Debes agregar al menos un ítem' });
    }

    // Verificar que la compra existe
    const [[compra]] = await conn.query('SELECT * FROM compras_proveedor WHERE id = ?', [id]);
    if (!compra) {
      await conn.rollback();
      return res.status(404).json({ mensaje: 'Orden de compra no encontrada' });
    }

    // Obtener tipo de movimiento entrada_almacen
    const [[tm]] = await conn.query(`SELECT id FROM tipos_movimiento WHERE codigo = 'entrada_almacen'`);
    if (!tm) {
      await conn.rollback();
      return res.status(500).json({ mensaje: 'Tipo de movimiento no configurado' });
    }

    let montoAdicional = 0;

    for (const item of items) {
      const cantidad    = parseFloat(item.cantidad || 0);
      const precioComp  = parseFloat(item.precio_compra || 0);
      const precioVenta = parseFloat(item.precio_venta || 0);
      if (cantidad <= 0 || !item.presentacion_id) continue;

      montoAdicional += cantidad * precioComp;

      // Actualizar precios si cambiaron
      await conn.query(
        'UPDATE presentaciones SET precio_compra = ?, precio_venta = ? WHERE id = ?',
        [precioComp, precioVenta, item.presentacion_id]
      );

      // Obtener stock actual para el log
      const [[stockActual]] = await conn.query(
        `SELECT ia.cantidad AS almacen, COALESCE(it.cantidad, 0) AS tienda
         FROM inventario_almacen ia
         LEFT JOIN inventario_tienda it ON it.presentacion_id = ia.presentacion_id
         WHERE ia.presentacion_id = ?`,
        [item.presentacion_id]
      );

      // Registrar movimiento de stock
      await conn.query(
        `INSERT INTO movimientos_stock
           (tipo_movimiento_id, presentacion_id, cantidad, stock_tienda_antes, stock_almacen_antes, nota)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          tm.id, item.presentacion_id, cantidad,
          stockActual?.tienda ?? 0,
          stockActual?.almacen ?? 0,
          `Recepción adicional — Orden de compra #${id}${item.nota ? ' - ' + item.nota : ''}`
        ]
      );

      // Sumar al almacén
      await conn.query(
        'UPDATE inventario_almacen SET cantidad = cantidad + ? WHERE presentacion_id = ?',
        [cantidad, item.presentacion_id]
      );
    }

    // Actualizar monto total de la orden
    const nuevoMonto = parseFloat(compra.monto) + montoAdicional;
    await conn.query(
      'UPDATE compras_proveedor SET monto = ? WHERE id = ?',
      [nuevoMonto, id]
    );

    await conn.commit();
    res.json({
      mensaje: 'Recepción registrada exitosamente — stock actualizado en almacén',
      monto_adicional: montoAdicional,
      nuevo_total: nuevoMonto
    });
  } catch (error) {
    await conn.rollback();
    console.error('Error al registrar recepción:', error);
    res.status(500).json({ mensaje: 'Error interno al registrar recepción' });
  } finally {
    conn.release();
  }
};

// ─── POST /api/proveedores/compras/:id/devolucion ──────────────────────────
exports.registrarDevolucionCompra = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params; // ID de la compra
    const { items } = req.body;

    if (!items || !items.length) {
      return res.status(400).json({ mensaje: 'No hay items para devolver' });
    }

    // Obtener la compra
    const [[compra]] = await conn.query('SELECT * FROM compras_proveedor WHERE id = ?', [id]);
    if (!compra) throw new Error('Compra no encontrada');

    // Intentar buscar el tipo 'ajuste_almacen_neg' o usar genérico
    let tipo_movimiento_id = 7; // Default
    const [tMovRows] = await conn.query(`SELECT id FROM tipos_movimiento WHERE codigo = 'ajuste_almacen_neg' LIMIT 1`);
    if (tMovRows.length > 0) tipo_movimiento_id = tMovRows[0].id;
    else {
      const [tMovAlt] = await conn.query(`SELECT id FROM tipos_movimiento WHERE afecta_almacen = -1 LIMIT 1`);
      if (tMovAlt.length > 0) tipo_movimiento_id = tMovAlt[0].id;
    }

    let montoDevolucion = 0;

    for (const item of items) {
      const cantidad = parseFloat(item.cantidad);
      const precioCompra = parseFloat(item.precio_compra) || 0;
      if (cantidad <= 0) continue;

      montoDevolucion += cantidad * precioCompra;

      // Obtener stock actual antes de restar
      const [[stockActual]] = await conn.query(
        `SELECT ia.cantidad AS almacen, COALESCE(it.cantidad, 0) AS tienda
         FROM inventario_almacen ia
         LEFT JOIN inventario_tienda it ON it.presentacion_id = ia.presentacion_id
         WHERE ia.presentacion_id = ?`,
        [item.presentacion_id]
      );
      const stockAntesAlmacen = stockActual?.almacen ?? 0;
      const stockAntesTienda = stockActual?.tienda ?? 0;

      // Restar stock
      let porRestar = cantidad;
      let aRestarAlmacen = 0;
      let aRestarTienda = 0;

      const almacenPositivo = Math.max(0, stockAntesAlmacen);
      if (almacenPositivo > 0) {
        aRestarAlmacen = Math.min(almacenPositivo, porRestar);
        porRestar -= aRestarAlmacen;
      }
      
      aRestarTienda = porRestar;

      if (aRestarAlmacen > 0) {
        await conn.query(
          `UPDATE inventario_almacen SET cantidad = cantidad - ? WHERE presentacion_id = ?`,
          [aRestarAlmacen, item.presentacion_id]
        );
      }
      
      if (aRestarTienda > 0) {
        await conn.query(
          `UPDATE inventario_tienda SET cantidad = cantidad - ? WHERE presentacion_id = ?`,
          [aRestarTienda, item.presentacion_id]
        );
      }

      const notaMovimiento = `Devolución de Compra #${id}${item.nota ? ' - ' + item.nota : ''}`;

      await conn.query(
        `INSERT INTO movimientos_stock (tipo_movimiento_id, presentacion_id, cantidad, stock_tienda_antes, stock_almacen_antes, nota)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [tipo_movimiento_id, item.presentacion_id, cantidad, stockAntesTienda, stockAntesAlmacen, notaMovimiento]
      );
    }

    // Actualizar el monto de la compra
    const nuevoMontoCompra = Math.max(0, parseFloat(compra.monto) - montoDevolucion);

    // Si el monto llega a 0 → la compra fue devuelta totalmente → eliminar de la BD
    if (nuevoMontoCompra === 0) {
      // Obtener todos los movimientos de esta compra para eliminarlos del historial de stock
      const cond = condNotaCompra('Orden de compra #', parseInt(id));
      await conn.query(
        `DELETE ms FROM movimientos_stock ms WHERE ${cond.sql}`,
        cond.params
      );
      await conn.query(`DELETE FROM pagos_proveedor WHERE compra_id = ?`, [id]);
      await conn.query(`DELETE FROM compras_proveedor WHERE id = ?`, [id]);

      await conn.commit();
      return res.json({ mensaje: 'Devolución total registrada. La orden de compra fue eliminada.', monto_devuelto: montoDevolucion, nuevo_total: 0, eliminada: true });
    }

    // Si no fue devolución total, solo actualizar estado y monto
    const [[pagosRows]] = await conn.query(`SELECT COALESCE(SUM(monto), 0) AS total_pagado FROM pagos_proveedor WHERE compra_id = ?`, [id]);
    const totalPagado = parseFloat(pagosRows.total_pagado);

    let nuevoEstado = 'pendiente';
    if (totalPagado > 0) nuevoEstado = 'parcial';
    if (totalPagado >= nuevoMontoCompra) nuevoEstado = 'pagado';

    await conn.query(
      `UPDATE compras_proveedor SET monto = ?, estado_pago = ? WHERE id = ?`,
      [nuevoMontoCompra, nuevoEstado, id]
    );

    await conn.commit();
    res.json({ mensaje: 'Devolución registrada exitosamente', monto_devuelto: montoDevolucion, nuevo_total: nuevoMontoCompra, eliminada: false });
  } catch (error) {
    await conn.rollback();
    console.error('Error al registrar devolución:', error);
    res.status(500).json({ mensaje: 'Error interno al registrar devolución' });
  } finally {
    conn.release();
  }
};

// ─── DELETE /api/proveedores/compras/:id ─────────────────────────────────────
// Elimina una orden de compra registrada por error y revierte todo su efecto:
//  - Quita del inventario el stock neto que ingresó (entradas − devoluciones)
//  - Borra sus movimientos de stock (orden, recepciones adicionales, devoluciones)
//  - Borra sus pagos y la cabecera de la compra
exports.eliminarCompra = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ mensaje: 'ID de compra inválido' });

    await conn.beginTransaction();

    const [[compra]] = await conn.query('SELECT id FROM compras_proveedor WHERE id = ? FOR UPDATE', [id]);
    if (!compra) {
      await conn.rollback();
      return res.status(404).json({ mensaje: 'Orden de compra no encontrada (quizás ya fue eliminada)' });
    }

    const cEntrada    = condNotaCompra('Orden de compra #', id);
    const cRecepcion  = condNotaCompra('Recepción adicional — Orden de compra #', id);
    const cDevolucion = condNotaCompra('Devolución de Compra #', id);

    // Stock neto por presentación que esta compra dejó en el inventario
    const [netos] = await conn.query(`
      SELECT ms.presentacion_id,
        SUM(CASE WHEN ${cDevolucion.sql} THEN -ms.cantidad ELSE ms.cantidad END) AS neto
      FROM movimientos_stock ms
      WHERE ${cEntrada.sql} OR ${cRecepcion.sql} OR ${cDevolucion.sql}
      GROUP BY ms.presentacion_id
    `, [...cDevolucion.params, ...cEntrada.params, ...cRecepcion.params, ...cDevolucion.params]);

    // 1) Verificar que haya stock suficiente para revertir (bloqueando las filas)
    const ajustes = [];
    const faltantes = [];
    for (const { presentacion_id, neto } of netos) {
      const porRestar = parseFloat(neto) || 0;
      if (porRestar <= 0) continue;

      const [[prod]] = await conn.query(
        `SELECT prod.nombre AS producto FROM presentaciones p
         JOIN productos prod ON prod.id = p.producto_id WHERE p.id = ?`,
        [presentacion_id]
      );
      const [[filaAlm]] = await conn.query(
        'SELECT cantidad FROM inventario_almacen WHERE presentacion_id = ? FOR UPDATE', [presentacion_id]
      );
      const [[filaTie]] = await conn.query(
        'SELECT cantidad FROM inventario_tienda WHERE presentacion_id = ? FOR UPDATE', [presentacion_id]
      );
      const almacen = Math.max(0, parseFloat(filaAlm?.cantidad) || 0);
      const tienda  = Math.max(0, parseFloat(filaTie?.cantidad) || 0);

      if (almacen + tienda < porRestar) {
        faltantes.push(`${prod?.producto || 'Producto #' + presentacion_id} (hay ${almacen + tienda}, se necesitan ${porRestar})`);
        continue;
      }
      // Primero se descuenta del almacén; si ya pasó a tienda, el resto sale de tienda
      const aRestarAlmacen = Math.min(almacen, porRestar);
      ajustes.push({ presentacion_id, aRestarAlmacen, aRestarTienda: porRestar - aRestarAlmacen });
    }

    if (faltantes.length) {
      await conn.rollback();
      return res.status(409).json({
        mensaje: 'No se puede eliminar la compra porque parte de sus productos ya se vendió o no está en stock:\n• '
          + faltantes.join('\n• ')
          + '\n\nUsa "Devolución de Compra" por la cantidad que todavía tienes.'
      });
    }

    // 2) Aplicar los descuentos de stock
    for (const { presentacion_id, aRestarAlmacen, aRestarTienda } of ajustes) {
      if (aRestarAlmacen > 0) {
        await conn.query(
          'UPDATE inventario_almacen SET cantidad = cantidad - ? WHERE presentacion_id = ?',
          [aRestarAlmacen, presentacion_id]
        );
      }
      if (aRestarTienda > 0) {
        await conn.query(
          'UPDATE inventario_tienda SET cantidad = cantidad - ? WHERE presentacion_id = ?',
          [aRestarTienda, presentacion_id]
        );
      }
    }

    await conn.query(
      `DELETE ms FROM movimientos_stock ms WHERE ${cEntrada.sql} OR ${cRecepcion.sql} OR ${cDevolucion.sql}`,
      [...cEntrada.params, ...cRecepcion.params, ...cDevolucion.params]
    );
    await conn.query('DELETE FROM pagos_proveedor WHERE compra_id = ?', [id]);
    await conn.query('DELETE FROM compras_proveedor WHERE id = ?', [id]);

    await conn.commit();
    res.json({ mensaje: 'Orden de compra eliminada y stock revertido correctamente' });
  } catch (error) {
    await conn.rollback();
    console.error('Error al eliminar compra:', error);
    res.status(500).json({ mensaje: 'Error interno al eliminar la compra' });
  } finally {
    conn.release();
  }
};

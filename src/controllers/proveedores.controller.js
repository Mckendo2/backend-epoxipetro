const pool = require('../config/db');

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
// Historial de compras/deudas con estado de pago
exports.obtenerCompras = async (req, res) => {
  try {
    const [filas] = await pool.query(`
      SELECT
        cp.id, cp.descripcion, cp.monto, cp.tipo_pago, cp.estado_pago,
        cp.fecha_vencimiento, cp.nota, cp.created_at,
        p.nombre AS proveedor,
        p.id     AS proveedor_id,
        u.nombre AS usuario,
        COALESCE((SELECT SUM(pp.monto) FROM pagos_proveedor pp WHERE pp.compra_id = cp.id), 0) AS monto_pagado
      FROM compras_proveedor cp
      JOIN proveedores p ON cp.proveedor_id = p.id
      LEFT JOIN usuarios u ON cp.usuario_id = u.id
      ORDER BY cp.created_at DESC
      LIMIT 200
    `);
    res.json(filas.map(f => ({
      ...f,
      monto: parseFloat(f.monto),
      monto_pagado: parseFloat(f.monto_pagado),
      saldo_pendiente: parseFloat(f.monto) - parseFloat(f.monto_pagado)
    })));
  } catch (error) {
    console.error('Error al obtener compras:', error);
    res.status(500).json({ mensaje: 'Error interno al obtener compras' });
  }
};

// ─── POST /api/proveedores/compras ───────────────────────────────────────────
exports.registrarCompra = async (req, res) => {
  try {
    const { proveedor_id, usuario_id, descripcion, monto, tipo_pago = 'credito', fecha_vencimiento, nota } = req.body;
    if (!proveedor_id) return res.status(400).json({ mensaje: 'Proveedor obligatorio' });
    if (!descripcion)  return res.status(400).json({ mensaje: 'La descripción es obligatoria' });
    if (!monto || monto <= 0) return res.status(400).json({ mensaje: 'El monto debe ser mayor a 0' });

    const estado_pago = tipo_pago === 'contado' ? 'pagado' : 'pendiente';

    const [resultado] = await pool.query(
      `INSERT INTO compras_proveedor
        (proveedor_id, usuario_id, descripcion, monto, tipo_pago, estado_pago, fecha_vencimiento, nota)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [proveedor_id, usuario_id || null, descripcion, monto, tipo_pago, estado_pago,
       fecha_vencimiento || null, nota || null]
    );
    res.status(201).json({ mensaje: 'Compra registrada exitosamente', id: resultado.insertId });
  } catch (error) {
    console.error('Error al registrar compra:', error);
    res.status(500).json({ mensaje: 'Error interno al registrar compra' });
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

    await conn.query(
      `INSERT INTO pagos_proveedor (compra_id, monto, metodo_pago, nota) VALUES (?, ?, ?, ?)`,
      [id, monto, metodo_pago, nota || null]
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
// KPI: deuda total pendiente, compras pendientes, proveedores activos
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
// Historial completo de pagos realizados
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

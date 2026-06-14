const pool = require('../config/db');

exports.getLogs = async (req, res) => {
  try {
    const { metodo, ruta, usuario_id, fecha_inicio, fecha_fin, pagina = 1, limite = 20 } = req.query;
    let query = `
      SELECT a.*, u.nombre, u.apellido 
      FROM auditoria a
      LEFT JOIN usuarios u ON a.usuario_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (metodo && metodo !== 'Todos') {
      query += ` AND a.metodo = ?`;
      params.push(metodo);
    }
    if (ruta) {
      query += ` AND a.ruta LIKE ?`;
      params.push(`%${ruta}%`);
    }
    if (usuario_id) {
      query += ` AND a.usuario_id = ?`;
      params.push(usuario_id);
    }
    if (fecha_inicio) {
      query += ` AND DATE(a.created_at) >= ?`;
      params.push(fecha_inicio);
    }
    if (fecha_fin) {
      query += ` AND DATE(a.created_at) <= ?`;
      params.push(fecha_fin);
    }

    query += ` ORDER BY a.created_at DESC LIMIT ? OFFSET ?`;
    const offset = (pagina - 1) * limite;
    params.push(parseInt(limite), offset);

    const [rows] = await pool.query(query, params);

    // Get total count for pagination
    let countQuery = `SELECT COUNT(*) as total FROM auditoria a WHERE 1=1`;
    const countParams = [];
    if (metodo && metodo !== 'Todos') { countQuery += ` AND a.metodo = ?`; countParams.push(metodo); }
    if (ruta) { countQuery += ` AND a.ruta LIKE ?`; countParams.push(`%${ruta}%`); }
    if (usuario_id) { countQuery += ` AND a.usuario_id = ?`; countParams.push(usuario_id); }
    if (fecha_inicio) { countQuery += ` AND DATE(a.created_at) >= ?`; countParams.push(fecha_inicio); }
    if (fecha_fin) { countQuery += ` AND DATE(a.created_at) <= ?`; countParams.push(fecha_fin); }
    const [countRows] = await pool.query(countQuery, countParams);

    res.json({
      data: rows,
      total: countRows[0].total,
      pagina: parseInt(pagina),
      limite: parseInt(limite)
    });
  } catch (error) {
    console.error('Error fetching auditoria logs:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

exports.getKpis = async (req, res) => {
  try {
    const [totalEventos] = await pool.query(`SELECT COUNT(*) as total FROM auditoria`);
    const [eventosHoy] = await pool.query(`SELECT COUNT(*) as total FROM auditoria WHERE DATE(created_at) = CURDATE()`);
    
    // Sesiones activas: Usuarios únicos que han tenido actividad en la última hora
    const [sesionesActivas] = await pool.query(`
      SELECT COUNT(DISTINCT usuario_id) as total 
      FROM auditoria 
      WHERE created_at >= NOW() - INTERVAL 1 HOUR
    `);

    res.json({
      totalEventos: totalEventos[0].total,
      eventosHoy: eventosHoy[0].total,
      sesionesActivas: sesionesActivas[0].total
    });
  } catch (error) {
    console.error('Error fetching auditoria kpis:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

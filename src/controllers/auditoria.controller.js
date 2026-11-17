const pool = require('../config/db');

// Bolivia (America/La_Paz) es UTC-4 fijo, sin horario de verano
const BOLIVIA_OFFSET_SEC = 4 * 3600;

// Convierte 'YYYY-MM-DD' (día boliviano) al epoch (segundos) de las 00:00 en Bolivia
const inicioDiaBolivia = (fecha) => Math.floor(Date.parse(`${fecha}T00:00:00-04:00`) / 1000);

exports.getLogs = async (req, res) => {
  try {
    const { metodo, ruta, usuario_id, fecha_inicio, fecha_fin, pagina = 1, limite = 20 } = req.query;
    // created_at_unix: epoch en segundos, independiente de la zona horaria del servidor MySQL/Node
    let query = `
      SELECT a.*, UNIX_TIMESTAMP(a.created_at) AS created_at_unix, u.nombre, u.apellido 
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
      query += ` AND UNIX_TIMESTAMP(a.created_at) >= ?`;
      params.push(inicioDiaBolivia(fecha_inicio));
    }
    if (fecha_fin) {
      query += ` AND UNIX_TIMESTAMP(a.created_at) < ?`;
      params.push(inicioDiaBolivia(fecha_fin) + 86400);
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
    if (fecha_inicio) { countQuery += ` AND UNIX_TIMESTAMP(a.created_at) >= ?`; countParams.push(inicioDiaBolivia(fecha_inicio)); }
    if (fecha_fin) { countQuery += ` AND UNIX_TIMESTAMP(a.created_at) < ?`; countParams.push(inicioDiaBolivia(fecha_fin) + 86400); }
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
    // Inicio del día actual en Bolivia (epoch en segundos)
    const ahora = Math.floor(Date.now() / 1000);
    const inicioHoyBolivia = Math.floor((ahora - BOLIVIA_OFFSET_SEC) / 86400) * 86400 + BOLIVIA_OFFSET_SEC;
    const [eventosHoy] = await pool.query(
      `SELECT COUNT(*) as total FROM auditoria WHERE UNIX_TIMESTAMP(created_at) >= ?`,
      [inicioHoyBolivia]
    );
    
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

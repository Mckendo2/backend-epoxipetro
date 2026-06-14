const pool = require('../config/db');
const bcrypt = require('bcrypt');

exports.obtenerUsuarios = async (req, res) => {
  try {
    const [filas] = await pool.query(`
      SELECT u.id, u.nombre, u.apellido, u.correo, u.celular, u.rol_id, u.estado, r.nombre AS rol
      FROM usuarios u
      LEFT JOIN roles r ON u.rol_id = r.id
    `);
    res.json(filas);
  } catch (error) {
    console.error('Error al obtener usuarios:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor al obtener usuarios' });
  }
};

exports.crearUsuario = async (req, res) => {
  try {
    const { nombre, apellido, correo, celular, contraseña, rol_id, estado } = req.body;

    if (!nombre || !correo || !contraseña || !rol_id) {
      return res.status(400).json({ mensaje: 'Faltan campos obligatorios' });
    }

    const saltRounds = 10;
    const hash = await bcrypt.hash(contraseña, saltRounds);

    const [resultado] = await pool.query(
      `INSERT INTO usuarios (nombre, apellido, correo, celular, contraseña, rol_id, estado) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [nombre, apellido, correo, celular, hash, rol_id, estado ?? true]
    );

    res.status(201).json({ mensaje: 'Usuario creado exitosamente', id: resultado.insertId });
  } catch (error) {
    console.error('Error al crear usuario:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ mensaje: 'El correo ya está registrado' });
    }
    res.status(500).json({ mensaje: 'Error interno del servidor al crear usuario' });
  }
};

exports.cambiarEstado = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Primero obtener el estado actual
    const [rows] = await pool.query('SELECT estado FROM usuarios WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ mensaje: 'Usuario no encontrado' });
    }

    const nuevoEstado = !rows[0].estado;

    await pool.query('UPDATE usuarios SET estado = ? WHERE id = ?', [nuevoEstado, id]);

    res.json({ mensaje: `Usuario ${nuevoEstado ? 'activado' : 'desactivado'} exitosamente`, estado: nuevoEstado });
  } catch (error) {
    console.error('Error al cambiar estado de usuario:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor al actualizar estado' });
  }
};

// ─── GET /api/usuarios/perfil ────────────────────────────────────────────────
// Obtener perfil completo del usuario autenticado
exports.obtenerPerfil = async (req, res) => {
  try {
    const userId = req.usuario.id;

    // Datos del usuario
    const [[usuario]] = await pool.query(`
      SELECT u.id, u.nombre, u.apellido, u.correo, u.celular, u.estado, u.created_at,
             r.nombre AS rol
      FROM usuarios u
      LEFT JOIN roles r ON u.rol_id = r.id
      WHERE u.id = ?
    `, [userId]);

    if (!usuario) return res.status(404).json({ mensaje: 'Usuario no encontrado' });

    // Permisos del usuario
    const [permisos] = await pool.query(`
      SELECT p.codigo, p.descripcion
      FROM permisos p
      INNER JOIN rol_permisos rp ON p.id = rp.permiso_id
      INNER JOIN usuarios u ON u.rol_id = rp.rol_id
      WHERE u.id = ?
      ORDER BY p.descripcion ASC
    `, [userId]);

    // Sesiones recientes (logins del usuario)
    const [sesiones] = await pool.query(`
      SELECT created_at, ip
      FROM auditoria
      WHERE usuario_id = ? AND accion LIKE '%sesi_n%'
      ORDER BY created_at DESC
      LIMIT 10
    `, [userId]);

    // Eventos recientes del usuario
    const [eventos] = await pool.query(`
      SELECT metodo, ruta, accion, created_at
      FROM auditoria
      WHERE usuario_id = ? AND accion NOT LIKE '%sesi_n%'
      ORDER BY created_at DESC
      LIMIT 10
    `, [userId]);

    res.json({
      usuario,
      permisos: permisos.map(p => p.descripcion),
      sesiones,
      eventos
    });
  } catch (error) {
    console.error('Error al obtener perfil:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

// ─── PUT /api/usuarios/perfil/contrasena ─────────────────────────────────────
exports.cambiarContrasena = async (req, res) => {
  try {
    const userId = req.usuario.id;
    const { contrasena_actual, contrasena_nueva } = req.body;

    if (!contrasena_actual || !contrasena_nueva) {
      return res.status(400).json({ mensaje: 'La contraseña actual y la nueva son obligatorias' });
    }
    if (contrasena_nueva.length < 4) {
      return res.status(400).json({ mensaje: 'La nueva contraseña debe tener al menos 4 caracteres' });
    }

    const [[usuario]] = await pool.query('SELECT contraseña FROM usuarios WHERE id = ?', [userId]);
    if (!usuario) return res.status(404).json({ mensaje: 'Usuario no encontrado' });

    const match = await bcrypt.compare(contrasena_actual, usuario.contraseña);
    if (!match) return res.status(401).json({ mensaje: 'La contraseña actual es incorrecta' });

    const hash = await bcrypt.hash(contrasena_nueva, 10);
    await pool.query('UPDATE usuarios SET contraseña = ? WHERE id = ?', [hash, userId]);

    res.json({ mensaje: 'Contraseña actualizada exitosamente' });
  } catch (error) {
    console.error('Error al cambiar contraseña:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

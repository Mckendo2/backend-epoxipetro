const pool = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'secret_para_desarrollo_123';

// Verifica si el sistema ya tiene usuarios registrados
exports.checkSetup = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT COUNT(*) AS total FROM usuarios');
    res.json({ needsSetup: rows[0].total === 0 });
  } catch (error) {
    console.error('Error en checkSetup:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

// Registra el primer administrador (solo funciona si no hay ningún usuario)
exports.registerAdmin = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT COUNT(*) AS total FROM usuarios');
    if (rows[0].total > 0) {
      return res.status(403).json({ mensaje: 'El sistema ya está configurado. No se puede crear otro administrador inicial.' });
    }

    const { nombre, apellido, correo, celular, contraseña } = req.body;

    if (!nombre || !correo || !contraseña) {
      return res.status(400).json({ mensaje: 'Nombre, correo y contraseña son obligatorios.' });
    }

    const hash = await bcrypt.hash(contraseña, 10);

    // Rol 1 = Administrador (ya existe en la DB por el SQL de producción)
    await pool.query(
      `INSERT INTO usuarios (nombre, apellido, correo, celular, contraseña, rol_id, estado) VALUES (?, ?, ?, ?, ?, 1, 1)`,
      [nombre, apellido || null, correo, celular || null, hash]
    );

    res.status(201).json({ mensaje: 'Administrador creado exitosamente. Ya puedes iniciar sesión.' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ mensaje: 'Ese correo ya está registrado.' });
    }
    console.error('Error en registerAdmin:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

exports.login = async (req, res) => {
  try {
    const { correo, contraseña } = req.body;

    if (!correo || !contraseña) {
      return res.status(400).json({ mensaje: 'Por favor, ingrese correo y contraseña' });
    }

    // Buscar usuario con su rol
    const [rows] = await pool.query(
      `SELECT u.*, r.nombre AS rol_nombre
       FROM usuarios u
       LEFT JOIN roles r ON u.rol_id = r.id
       WHERE u.correo = ?`,
      [correo]
    );
    const usuario = rows[0];

    if (!usuario) {
      return res.status(401).json({ mensaje: 'Credenciales inválidas' });
    }

    if (!usuario.estado) {
      return res.status(403).json({ mensaje: 'Cuenta deshabilitada. Contacte al administrador.' });
    }

    // Verificar contraseña
    const match = await bcrypt.compare(contraseña, usuario.contraseña);
    
    if (!match) {
      return res.status(401).json({ mensaje: 'Credenciales inválidas' });
    }

    // Buscar permisos asociados a este rol
    const [permisosRows] = await pool.query(`
      SELECT p.codigo 
      FROM permisos p
      INNER JOIN rol_permisos rp ON p.id = rp.permiso_id
      WHERE rp.rol_id = ?
    `, [usuario.rol_id]);
    
    const permisos = permisosRows.map(row => row.codigo);

    // Generar el Token
    const token = jwt.sign(
      { 
        id: usuario.id, 
        correo: usuario.correo, 
        rol_id: usuario.rol_id, 
        rol_nombre: usuario.rol_nombre,
        permisos 
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Registro de auditoría para sesión
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    try {
      await pool.query(
        `INSERT INTO auditoria (usuario_id, metodo, ruta, accion, ip, detalles) VALUES (?, ?, ?, ?, ?, ?)`,
        [usuario.id, 'POST', req.originalUrl, 'Inicio de sesión exitoso', ip, null]
      );
    } catch (e) {
      console.error('Error registrando login en auditoria:', e);
    }

    res.json({
      mensaje: 'Inicio de sesión exitoso',
      token,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        apellido: usuario.apellido,
        correo: usuario.correo,
        rol_id: usuario.rol_id,
        rol_nombre: usuario.rol_nombre,
        permisos
      }
    });

  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

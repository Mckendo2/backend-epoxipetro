const pool = require('../config/db');

// GET /api/roles
exports.obtenerRoles = async (req, res) => {
  try {
    const [roles] = await pool.query('SELECT * FROM roles ORDER BY nombre ASC');
    res.json(roles);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al obtener roles' });
  }
};

// GET /api/roles/:id
exports.obtenerRol = async (req, res) => {
  try {
    const { id } = req.params;
    const [[rol]] = await pool.query('SELECT * FROM roles WHERE id = ?', [id]);
    if (!rol) return res.status(404).json({ mensaje: 'Rol no encontrado' });
    res.json(rol);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al obtener el rol' });
  }
};

// POST /api/roles
exports.crearRol = async (req, res) => {
  try {
    const { nombre, descripcion } = req.body;
    if (!nombre) return res.status(400).json({ mensaje: 'El nombre del rol es obligatorio' });

    // Verificar si existe el nombre
    const [[existe]] = await pool.query('SELECT id FROM roles WHERE nombre = ?', [nombre]);
    if (existe) return res.status(400).json({ mensaje: 'Ya existe un rol con este nombre' });

    const [resultado] = await pool.query(
      'INSERT INTO roles (nombre, descripcion) VALUES (?, ?)',
      [nombre, descripcion || null]
    );

    res.status(201).json({ id: resultado.insertId, mensaje: 'Rol creado exitosamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al crear el rol' });
  }
};

// PUT /api/roles/:id
exports.actualizarRol = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, descripcion } = req.body;

    if (!nombre) return res.status(400).json({ mensaje: 'El nombre del rol es obligatorio' });

    // Verificar si existe otro con el mismo nombre
    const [[existe]] = await pool.query('SELECT id FROM roles WHERE nombre = ? AND id != ?', [nombre, id]);
    if (existe) return res.status(400).json({ mensaje: 'Ya existe otro rol con este nombre' });

    const [resultado] = await pool.query(
      'UPDATE roles SET nombre = ?, descripcion = ? WHERE id = ?',
      [nombre, descripcion || null, id]
    );

    if (resultado.affectedRows === 0) return res.status(404).json({ mensaje: 'Rol no encontrado' });

    res.json({ mensaje: 'Rol actualizado exitosamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al actualizar el rol' });
  }
};

// DELETE /api/roles/:id
exports.eliminarRol = async (req, res) => {
  try {
    const { id } = req.params;

    // Evitar eliminar si está asignado a un usuario
    const [[enUso]] = await pool.query('SELECT id FROM usuarios WHERE rol_id = ? LIMIT 1', [id]);
    if (enUso) return res.status(400).json({ mensaje: 'No se puede eliminar el rol porque está asignado a uno o más usuarios.' });

    // Evitar eliminar el rol principal (Administrador)
    const [[rol]] = await pool.query('SELECT nombre FROM roles WHERE id = ?', [id]);
    if (!rol) return res.status(404).json({ mensaje: 'Rol no encontrado' });
    if (rol.nombre.toLowerCase() === 'administrador') return res.status(400).json({ mensaje: 'No se puede eliminar el rol principal del sistema.' });

    await pool.query('DELETE FROM roles WHERE id = ?', [id]);
    
    res.json({ mensaje: 'Rol eliminado exitosamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al eliminar el rol' });
  }
};

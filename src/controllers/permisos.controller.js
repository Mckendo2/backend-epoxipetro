const pool = require('../config/db');

exports.getAllPermisos = async (req, res) => {
  try {
    const [permisos] = await pool.query('SELECT * FROM permisos ORDER BY id ASC');
    res.json(permisos);
  } catch (error) {
    console.error('Error fetching permisos:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

exports.getPermisosByRol = async (req, res) => {
  try {
    const { rol_id } = req.params;
    const [permisos] = await pool.query('SELECT permiso_id FROM rol_permisos WHERE rol_id = ?', [rol_id]);
    
    // Devolver un arreglo simple de IDs de permisos [1, 3, 4]
    const ids = permisos.map(p => p.permiso_id);
    res.json(ids);
  } catch (error) {
    console.error('Error fetching rol permisos:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

exports.updatePermisosRol = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { rol_id } = req.params;
    const { permisos_ids } = req.body; // Un arreglo de IDs: [1, 2, 5]

    if (!Array.isArray(permisos_ids)) {
      return res.status(400).json({ mensaje: 'Formato de permisos inválido' });
    }

    await connection.beginTransaction();

    // Eliminar los permisos actuales de este rol
    await connection.query('DELETE FROM rol_permisos WHERE rol_id = ?', [rol_id]);

    // Insertar los nuevos permisos
    if (permisos_ids.length > 0) {
      // Construir la query para insert múltiple: INSERT INTO ... VALUES (?,?), (?,?)
      const values = permisos_ids.map(permiso_id => [rol_id, permiso_id]);
      await connection.query('INSERT INTO rol_permisos (rol_id, permiso_id) VALUES ?', [values]);
    }

    await connection.commit();
    res.json({ mensaje: 'Permisos actualizados correctamente' });
  } catch (error) {
    await connection.rollback();
    console.error('Error updating rol permisos:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  } finally {
    connection.release();
  }
};

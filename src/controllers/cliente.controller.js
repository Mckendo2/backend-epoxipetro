const pool = require('../config/db');

exports.obtenerTodos = async (req, res) => {
  try {
    const [filas] = await pool.query(
      `SELECT id, nombre, apellido, telefono, correo, direccion, created_at FROM clientes ORDER BY created_at DESC`
    );
    res.json(filas);
  } catch (error) {
    console.error('Error al obtener clientes:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor al obtener clientes' });
  }
};

exports.crearCliente = async (req, res) => {
  try {
    const { nombre, apellido, telefono, correo, direccion } = req.body;

    if (!nombre || !apellido || !telefono) {
      return res.status(400).json({ mensaje: 'Nombre, apellido y teléfono son obligatorios' });
    }

    const [resultado] = await pool.query(
      `INSERT INTO clientes (nombre, apellido, telefono, correo, direccion) VALUES (?, ?, ?, ?, ?)`,
      [nombre, apellido, telefono, correo, direccion]
    );

    res.status(201).json({ mensaje: 'Cliente creado exitosamente', id: resultado.insertId });
  } catch (error) {
    console.error('Error al crear cliente:', error);
    res.status(500).json({ mensaje: 'Error al registrar el cliente en la base de datos' });
  }
};

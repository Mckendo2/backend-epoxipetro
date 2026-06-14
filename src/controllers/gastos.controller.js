const pool = require('../config/db');

// Crear un nuevo gasto
exports.crearGasto = async (req, res) => {
  try {
    const { fecha, categoria, valor, nombre, metodoPago } = req.body;
    
    if (!fecha || !categoria || !valor || !metodoPago) {
      return res.status(400).json({ mensaje: 'Faltan campos obligatorios' });
    }

    const [result] = await pool.query(
      'INSERT INTO gastos (fecha, categoria, valor, nombre, metodo_pago) VALUES (?, ?, ?, ?, ?)',
      [fecha, categoria, valor, nombre || null, metodoPago]
    );

    res.status(201).json({
      id: result.insertId,
      mensaje: 'Gasto creado exitosamente'
    });
  } catch (error) {
    console.error('Error en crearGasto:', error);
    res.status(500).json({ mensaje: 'Error al crear el gasto' });
  }
};

// Obtener todos los gastos (opcional para el futuro)
exports.obtenerGastos = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM gastos ORDER BY fecha DESC, created_at DESC');
    res.json(rows);
  } catch (error) {
    console.error('Error en obtenerGastos:', error);
    res.status(500).json({ mensaje: 'Error al obtener gastos' });
  }
};

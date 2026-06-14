const pool = require('../src/config/db');

async function createTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS gastos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        fecha DATE NOT NULL,
        categoria VARCHAR(50) NOT NULL,
        valor DECIMAL(10,2) NOT NULL,
        nombre VARCHAR(255),
        metodo_pago VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Tabla gastos creada');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit();
  }
}

createTable();

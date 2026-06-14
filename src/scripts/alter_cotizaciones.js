const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'alvarez_db'
};

async function createCotizacionesTables() {
  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    console.log('Conectado a la base de datos MySQL.');

    await connection.query(`
      CREATE TABLE IF NOT EXISTS cotizaciones (
        id INT AUTO_INCREMENT PRIMARY KEY,
        cliente_id INT NULL,
        usuario_id INT NOT NULL,
        total DECIMAL(10,2) NOT NULL,
        adelanto DECIMAL(10,2) DEFAULT 0,
        saldo DECIMAL(10,2) NOT NULL,
        estado ENUM('pendiente', 'completada', 'anulada') DEFAULT 'pendiente',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL,
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('Tabla cotizaciones creada o ya existe.');

    await connection.query(`
      CREATE TABLE IF NOT EXISTS detalle_cotizaciones (
        id INT AUTO_INCREMENT PRIMARY KEY,
        cotizacion_id INT NOT NULL,
        presentacion_id INT NOT NULL,
        cantidad INT NOT NULL,
        precio_unitario DECIMAL(10,2) NOT NULL,
        subtotal DECIMAL(10,2) NOT NULL,
        FOREIGN KEY (cotizacion_id) REFERENCES cotizaciones(id) ON DELETE CASCADE,
        FOREIGN KEY (presentacion_id) REFERENCES presentaciones(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('Tabla detalle_cotizaciones creada o ya existe.');

  } catch (error) {
    console.error('Error al crear tablas de cotizaciones:', error.message);
  } finally {
    if (connection) {
      await connection.end();
      console.log('Conexión cerrada.');
    }
  }
}

createCotizacionesTables();

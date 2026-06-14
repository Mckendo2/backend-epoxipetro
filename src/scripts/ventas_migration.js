const mysql = require('mysql2/promise');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

async function runMigration() {
  let connection;
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '12345',
      database: process.env.DB_NAME || 'alvarez'
    });

    console.log('Iniciando migración de ventas...\n');

    // 1. VENTAS (cabecera)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS ventas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        cliente_id INT NULL,
        usuario_id INT NULL,
        total DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        descuento DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        metodo_pago ENUM('efectivo','tarjeta','transferencia','qr') NOT NULL DEFAULT 'efectivo',
        nota TEXT NULL,
        estado ENUM('completada','anulada') NOT NULL DEFAULT 'completada',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL,
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
      );
    `);
    console.log('✓ Tabla ventas');

    // 2. DETALLE VENTAS (líneas)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS detalle_ventas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        venta_id INT NOT NULL,
        presentacion_id INT NOT NULL,
        cantidad DECIMAL(10,3) NOT NULL,
        precio_unitario DECIMAL(10,2) NOT NULL,
        subtotal DECIMAL(10,2) NOT NULL,
        FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE CASCADE,
        FOREIGN KEY (presentacion_id) REFERENCES presentaciones(id)
      );
    `);
    console.log('✓ Tabla detalle_ventas');

    console.log('\n✅ Migración de ventas completada exitosamente.');
    await connection.end();
  } catch (error) {
    console.error('\n❌ Error en la migración:', error.message);
    if (connection) await connection.end();
    process.exit(1);
  }
}

runMigration();

const pool = require('./src/config/db');

async function run() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pagos_venta (
        id INT AUTO_INCREMENT PRIMARY KEY,
        venta_id INT NOT NULL,
        monto DECIMAL(10,2) NOT NULL,
        metodo_pago ENUM('efectivo', 'tarjeta', 'transferencia', 'qr') NOT NULL,
        nota TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE CASCADE
      )
    `);
    console.log("Table created");
    process.exit(0);
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
}
run();

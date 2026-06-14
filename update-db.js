const pool = require('./src/config/db');
pool.query(`ALTER TABLE ventas ADD COLUMN tipo_venta ENUM('contado', 'credito') DEFAULT 'contado', ADD COLUMN estado_pago ENUM('pagado', 'pendiente') DEFAULT 'pagado'`)
  .then(() => { console.log('DB Updated'); process.exit(0); })
  .catch(console.error);

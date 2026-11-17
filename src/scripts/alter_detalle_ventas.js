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

    console.log('Iniciando migración de detalle_ventas...\n');

    // 1. Agregar columnas de snapshot si no existen
    await connection.query(`
      ALTER TABLE detalle_ventas
        ADD COLUMN IF NOT EXISTS nombre_producto VARCHAR(200) NULL,
        ADD COLUMN IF NOT EXISTS nombre_presentacion VARCHAR(150) NULL;
    `);
    console.log('✓ Columnas nombre_producto y nombre_presentacion agregadas');

    // 2. Poblar los snapshots con los datos actuales (para registros ya existentes)
    await connection.query(`
      UPDATE detalle_ventas dv
      JOIN presentaciones pr ON dv.presentacion_id = pr.id
      JOIN productos p ON pr.producto_id = p.id
      SET dv.nombre_producto = p.nombre,
          dv.nombre_presentacion = pr.nombre
      WHERE dv.nombre_producto IS NULL;
    `);
    console.log('✓ Snapshots poblados en registros existentes');

    // 3. Cambiar FK presentacion_id a ON DELETE SET NULL
    //    Primero hay que ver el nombre del constraint actual
    const [constraints] = await connection.query(`
      SELECT CONSTRAINT_NAME
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'detalle_ventas'
        AND COLUMN_NAME = 'presentacion_id'
        AND REFERENCED_TABLE_NAME = 'presentaciones';
    `);

    if (constraints.length > 0) {
      const constraintName = constraints[0].CONSTRAINT_NAME;
      await connection.query(`ALTER TABLE detalle_ventas DROP FOREIGN KEY \`${constraintName}\``);
      console.log(`✓ FK antigua eliminada: ${constraintName}`);
    }

    // 4. Hacer presentacion_id nullable y agregar FK con ON DELETE SET NULL
    await connection.query(`
      ALTER TABLE detalle_ventas
        MODIFY COLUMN presentacion_id INT NULL;
    `);
    console.log('✓ presentacion_id ahora permite NULL');

    await connection.query(`
      ALTER TABLE detalle_ventas
        ADD CONSTRAINT fk_detalle_ventas_presentacion
        FOREIGN KEY (presentacion_id) REFERENCES presentaciones(id) ON DELETE SET NULL;
    `);
    console.log('✓ FK recreada con ON DELETE SET NULL');

    // 5. Mismo proceso para detalle_devoluciones si existe
    const [tablas] = await connection.query(`SHOW TABLES LIKE 'detalle_devoluciones'`);
    if (tablas.length > 0) {
      await connection.query(`
        ALTER TABLE detalle_devoluciones
          ADD COLUMN IF NOT EXISTS nombre_producto VARCHAR(200) NULL,
          ADD COLUMN IF NOT EXISTS nombre_presentacion VARCHAR(150) NULL;
      `);
      await connection.query(`
        UPDATE detalle_devoluciones dd
        JOIN presentaciones pr ON dd.presentacion_id = pr.id
        JOIN productos p ON pr.producto_id = p.id
        SET dd.nombre_producto = p.nombre,
            dd.nombre_presentacion = pr.nombre
        WHERE dd.nombre_producto IS NULL;
      `);

      const [dc] = await connection.query(`
        SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'detalle_devoluciones'
          AND COLUMN_NAME = 'presentacion_id' AND REFERENCED_TABLE_NAME = 'presentaciones';
      `);
      if (dc.length > 0) {
        await connection.query(`ALTER TABLE detalle_devoluciones DROP FOREIGN KEY \`${dc[0].CONSTRAINT_NAME}\``);
      }
      await connection.query(`ALTER TABLE detalle_devoluciones MODIFY COLUMN presentacion_id INT NULL`);
      await connection.query(`
        ALTER TABLE detalle_devoluciones
          ADD CONSTRAINT fk_detalle_dev_presentacion
          FOREIGN KEY (presentacion_id) REFERENCES presentaciones(id) ON DELETE SET NULL;
      `);
      console.log('✓ detalle_devoluciones también migrado');
    }

    // 6. movimientos_stock: cambiar FK a ON DELETE SET NULL también
    const [ms] = await connection.query(`
      SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'movimientos_stock'
        AND COLUMN_NAME = 'presentacion_id' AND REFERENCED_TABLE_NAME = 'presentaciones';
    `);
    if (ms.length > 0) {
      await connection.query(`ALTER TABLE movimientos_stock DROP FOREIGN KEY \`${ms[0].CONSTRAINT_NAME}\``);
      await connection.query(`ALTER TABLE movimientos_stock MODIFY COLUMN presentacion_id INT NULL`);
      await connection.query(`
        ALTER TABLE movimientos_stock
          ADD CONSTRAINT fk_movimientos_presentacion
          FOREIGN KEY (presentacion_id) REFERENCES presentaciones(id) ON DELETE SET NULL;
      `);
      console.log('✓ movimientos_stock FK cambiada a ON DELETE SET NULL');
    }

    console.log('\n✅ Migración completada. Ahora puedes eliminar productos/presentaciones aunque tengan ventas.');
    await connection.end();
  } catch (error) {
    console.error('\n❌ Error en la migración:', error.message);
    if (connection) await connection.end();
    process.exit(1);
  }
}

runMigration();

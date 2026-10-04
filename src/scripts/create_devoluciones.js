const mysql = require('mysql2/promise');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

async function runMigration() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '12345',
    database: process.env.DB_NAME || 'alvarez',
    multipleStatements: true
  });

  try {
    console.log('Creando tabla devoluciones...');

    // Tabla cabecera de devolución
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`devoluciones\` (
        \`id\`         int NOT NULL AUTO_INCREMENT,
        \`venta_id\`   int NOT NULL,
        \`usuario_id\` int DEFAULT NULL,
        \`motivo\`     varchar(255) COLLATE utf8mb3_spanish_ci DEFAULT NULL,
        \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`venta_id\` (\`venta_id\`),
        KEY \`usuario_id\` (\`usuario_id\`),
        CONSTRAINT \`devoluciones_ibfk_1\` FOREIGN KEY (\`venta_id\`) REFERENCES \`ventas\` (\`id\`),
        CONSTRAINT \`devoluciones_ibfk_2\` FOREIGN KEY (\`usuario_id\`) REFERENCES \`usuarios\` (\`id\`) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_spanish_ci;
    `);
    console.log('  ✔ Tabla devoluciones creada (o ya existía).');

    // Tabla detalle de devolución
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`detalle_devoluciones\` (
        \`id\`              int NOT NULL AUTO_INCREMENT,
        \`devolucion_id\`   int NOT NULL,
        \`detalle_venta_id\` int NOT NULL,
        \`presentacion_id\` int NOT NULL,
        \`cantidad\`        decimal(10,3) NOT NULL,
        \`precio_unitario\` decimal(10,2) NOT NULL,
        PRIMARY KEY (\`id\`),
        KEY \`devolucion_id\` (\`devolucion_id\`),
        KEY \`detalle_venta_id\` (\`detalle_venta_id\`),
        KEY \`presentacion_id\` (\`presentacion_id\`),
        CONSTRAINT \`dd_ibfk_1\` FOREIGN KEY (\`devolucion_id\`) REFERENCES \`devoluciones\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`dd_ibfk_2\` FOREIGN KEY (\`detalle_venta_id\`) REFERENCES \`detalle_ventas\` (\`id\`),
        CONSTRAINT \`dd_ibfk_3\` FOREIGN KEY (\`presentacion_id\`) REFERENCES \`presentaciones\` (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_spanish_ci;
    `);
    console.log('  ✔ Tabla detalle_devoluciones creada (o ya existía).');

    console.log('\nMigración completada exitosamente.');
  } catch (error) {
    console.error('Error en la migración:', error);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

runMigration();

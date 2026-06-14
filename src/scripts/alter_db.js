const mysql = require('mysql2/promise');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

async function runMigration() {
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '12345',
      database: process.env.DB_NAME || 'alvarez'
    });

    console.log('Ejecutando alter table...');
    
    // Check if column exists to avoid errors on rerun
    try {
      await connection.query('ALTER TABLE usuarios ADD COLUMN apellido VARCHAR(100) AFTER nombre;');
      console.log('Columna apellido agregada.');
    } catch (e) {
      if (e.code === 'ER_DUP_FIELDNAME') console.log('Columna apellido ya existe.');
      else throw e;
    }

    try {
      await connection.query('ALTER TABLE usuarios ADD COLUMN celular VARCHAR(20) AFTER correo;');
      console.log('Columna celular agregada.');
    } catch (e) {
      if (e.code === 'ER_DUP_FIELDNAME') console.log('Columna celular ya existe.');
      else throw e;
    }

    await connection.end();
    console.log('Migración completada.');
  } catch (error) {
    console.error('Error en la migración:', error);
    process.exit(1);
  }
}

runMigration();

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

    const [rows] = await connection.query('DESCRIBE usuarios');
    console.table(rows);
    await connection.end();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

runMigration();

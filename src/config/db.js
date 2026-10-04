const mysql = require('mysql2/promise');
require('dotenv').config(); // Load variables from .env in the root

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: '-04:00',          // Bolivia (UTC-4) — garantiza que created_at se lea y escriba en hora local boliviana
  charset: 'utf8mb4',         // Soporte de caracteres especiales y emojis
  decimalNumbers: true        // Retorna DECIMAL/NUMERIC como números JS en vez de strings
});

module.exports = pool;

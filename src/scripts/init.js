const mysql = require('mysql2/promise');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') }); // Point to backend/.env safely

async function initializeDatabase() {
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '12345',
    });

    console.log('Connected to MySQL server.');

    const dbName = process.env.DB_NAME || 'alvarez';
    await connection.changeUser({ database: dbName });

    const createRolesTable = `
      CREATE TABLE IF NOT EXISTS roles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(50) NOT NULL UNIQUE,
        descripcion VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );
    `;
    await connection.query(createRolesTable);
    console.log('Table "roles" created or already exists.');

    const createUsuariosTable = `
      CREATE TABLE IF NOT EXISTS usuarios (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL,
        apellido VARCHAR(100),
        correo VARCHAR(100) NOT NULL UNIQUE,
        celular VARCHAR(20),
        contraseña VARCHAR(255) NOT NULL,
        rol_id INT,
        estado BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (rol_id) REFERENCES roles(id) ON DELETE SET NULL
      );
    `;
    await connection.query(createUsuariosTable);
    console.log('Table "usuarios" created or already exists.');

    const createClientesTable = `
      CREATE TABLE IF NOT EXISTS clientes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL,
        apellido VARCHAR(100) NOT NULL,
        telefono VARCHAR(20) NOT NULL,
        correo VARCHAR(100),
        direccion VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );
    `;
    await connection.query(createClientesTable);
    console.log('Table "clientes" created or already exists.');

    const insertDefaultRoles = `
      INSERT IGNORE INTO roles (nombre, descripcion) VALUES 
      ('Administrador', 'Acceso total al sistema'),
      ('Vendedor', 'Acceso a ventas e inventario'),
      ('Almacenero', 'Acceso a inventario unicamente')
    `;
    await connection.query(insertDefaultRoles);
    console.log('Default roles inserted.');

    await connection.end();
    console.log('Database initialization completed successfully.');
  } catch (error) {
    console.error('Error initializing database:', error);
    process.exit(1);
  }
}

initializeDatabase();

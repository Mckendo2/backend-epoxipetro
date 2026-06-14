const mysql = require('mysql2/promise');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

async function seedDatabase() {
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '12345',
      database: process.env.DB_NAME || 'alvarez'
    });

    console.log('Conectado a la base de datos para insertar datos de prueba.');

    // Obtener los IDs de los roles
    const [roles] = await connection.query('SELECT id, nombre FROM roles WHERE nombre IN ("Administrador", "Vendedor")');
    
    let adminId = null;
    let vendedorId = null;

    roles.forEach(role => {
      if (role.nombre === 'Administrador') adminId = role.id;
      if (role.nombre === 'Vendedor') vendedorId = role.id;
    });

    if (!adminId || !vendedorId) {
      throw new Error('Roles no encontrados. Asegúrate de haber ejecutado init.js primero.');
    }
    
    // Insertar usuarios de prueba
    // Nota: Por ahora la contraseña está en texto plano para las pruebas. 
    // Cuando implementemos el Login o Auth, usaremos bcrypt.
    const insertUsers = `
      INSERT IGNORE INTO usuarios (nombre, apellido, correo, celular, contraseña, rol_id) VALUES 
      ('Admin', 'Principal', 'admin@alvarez.com', '123456789', '123456', ?),
      ('Juan', 'Pérez', 'vendedor@alvarez.com', '987654321', '123456', ?)
    `;

    await connection.query(insertUsers, [adminId, vendedorId]);
    console.log('2 Usuarios de prueba insertados correctamente relacionados con los roles de Administrador y Vendedor.');

    await connection.end();
  } catch (error) {
    console.error('Error insertando datos:', error);
    process.exit(1);
  }
}

seedDatabase();

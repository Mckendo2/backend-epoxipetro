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

    console.log('Iniciando migración de inventario...\n');

    // 1. CATEGORIAS
    await connection.query(`
      CREATE TABLE IF NOT EXISTS categorias (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL UNIQUE,
        descripcion VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✓ Tabla categorias');

    // 2. MARCAS
    await connection.query(`
      CREATE TABLE IF NOT EXISTS marcas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL UNIQUE,
        pais_origen VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✓ Tabla marcas');

    // 3. UNIDADES DE MEDIDA
    await connection.query(`
      CREATE TABLE IF NOT EXISTS unidades_medida (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(50) NOT NULL UNIQUE,
        abreviatura VARCHAR(10) NOT NULL
      );
    `);
    console.log('✓ Tabla unidades_medida');

    // 4. TIPOS DE MOVIMIENTO
    await connection.query(`
      CREATE TABLE IF NOT EXISTS tipos_movimiento (
        id INT AUTO_INCREMENT PRIMARY KEY,
        codigo VARCHAR(50) NOT NULL UNIQUE,
        descripcion VARCHAR(255),
        afecta_almacen TINYINT NOT NULL DEFAULT 0,
        afecta_tienda TINYINT NOT NULL DEFAULT 0
      );
    `);
    console.log('✓ Tabla tipos_movimiento');

    // 5. PRODUCTOS
    await connection.query(`
      CREATE TABLE IF NOT EXISTS productos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(200) NOT NULL,
        descripcion TEXT,
        categoria_id INT,
        marca_id INT,
        imagen_url VARCHAR(500),
        estado BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE SET NULL,
        FOREIGN KEY (marca_id) REFERENCES marcas(id) ON DELETE SET NULL
      );
    `);
    console.log('✓ Tabla productos');

    // 6. PRESENTACIONES
    await connection.query(`
      CREATE TABLE IF NOT EXISTS presentaciones (
        id INT AUTO_INCREMENT PRIMARY KEY,
        producto_id INT NOT NULL,
        nombre VARCHAR(150) NOT NULL,
        codigo_barras VARCHAR(100) UNIQUE,
        sku VARCHAR(100) UNIQUE,
        unidad_medida_id INT,
        cantidad_unidad DECIMAL(10,3) NOT NULL DEFAULT 1.000,
        precio_compra DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        precio_venta DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        estado BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE,
        FOREIGN KEY (unidad_medida_id) REFERENCES unidades_medida(id) ON DELETE SET NULL
      );
    `);
    console.log('✓ Tabla presentaciones');

    // 7. INVENTARIO TIENDA
    await connection.query(`
      CREATE TABLE IF NOT EXISTS inventario_tienda (
        id INT AUTO_INCREMENT PRIMARY KEY,
        presentacion_id INT NOT NULL UNIQUE,
        cantidad DECIMAL(10,3) NOT NULL DEFAULT 0.000,
        cantidad_minima DECIMAL(10,3) NOT NULL DEFAULT 0.000,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (presentacion_id) REFERENCES presentaciones(id) ON DELETE CASCADE
      );
    `);
    console.log('✓ Tabla inventario_tienda');

    // 8. INVENTARIO ALMACEN
    await connection.query(`
      CREATE TABLE IF NOT EXISTS inventario_almacen (
        id INT AUTO_INCREMENT PRIMARY KEY,
        presentacion_id INT NOT NULL UNIQUE,
        cantidad DECIMAL(10,3) NOT NULL DEFAULT 0.000,
        ubicacion VARCHAR(100),
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (presentacion_id) REFERENCES presentaciones(id) ON DELETE CASCADE
      );
    `);
    console.log('✓ Tabla inventario_almacen');

    // 9. MOVIMIENTOS DE STOCK
    await connection.query(`
      CREATE TABLE IF NOT EXISTS movimientos_stock (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tipo_movimiento_id INT NOT NULL,
        presentacion_id INT NOT NULL,
        cantidad DECIMAL(10,3) NOT NULL,
        stock_tienda_antes DECIMAL(10,3) DEFAULT 0.000,
        stock_almacen_antes DECIMAL(10,3) DEFAULT 0.000,
        usuario_id INT,
        nota VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tipo_movimiento_id) REFERENCES tipos_movimiento(id),
        FOREIGN KEY (presentacion_id) REFERENCES presentaciones(id),
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
      );
    `);
    console.log('✓ Tabla movimientos_stock');

    // --- DATOS INICIALES ---
    console.log('\nInsertando datos iniciales...');

    await connection.query(`
      INSERT IGNORE INTO categorias (nombre, descripcion) VALUES
      ('Chapas para Puerta', 'Cerraduras y chapas para puertas de todo tipo'),
      ('Candados', 'Candados de diferentes medidas y seguridades'),
      ('Resinas Epóxicas', 'Resinas para pisos, manualidades, encapsulado y UV'),
      ('Insumos', 'Materiales y accesorios varios');
    `);
    console.log('✓ Categorías');

    await connection.query(`
      INSERT IGNORE INTO marcas (nombre) VALUES
      ('Petro'),
      ('Cisa'),
      ('Yale'),
      ('Master Lock'),
      ('Sin Marca');
    `);
    console.log('✓ Marcas');

    await connection.query(`
      INSERT IGNORE INTO unidades_medida (nombre, abreviatura) VALUES
      ('Pieza', 'pza'),
      ('Kilogramo', 'kg'),
      ('Gramo', 'gr'),
      ('Litro', 'L'),
      ('Kit', 'kit'),
      ('Par', 'par');
    `);
    console.log('✓ Unidades de medida');

    await connection.query(`
      INSERT IGNORE INTO tipos_movimiento (codigo, descripcion, afecta_almacen, afecta_tienda) VALUES
      ('entrada_almacen',     'Entrada de mercadería al almacén',       1,  0),
      ('traslado_a_tienda',   'Traslado de almacén a tienda',          -1,  1),
      ('salida_venta',        'Salida por venta en tienda',             0, -1),
      ('ajuste_positivo',     'Ajuste manual: suma stock',              0,  1),
      ('ajuste_negativo',     'Ajuste manual: resta stock',             0, -1),
      ('ajuste_almacen_pos',  'Ajuste manual en almacén: suma',         1,  0),
      ('ajuste_almacen_neg',  'Ajuste manual en almacén: resta',       -1,  0);
    `);
    console.log('✓ Tipos de movimiento');

    console.log('\n✅ Migración completada exitosamente.');
    await connection.end();
  } catch (error) {
    console.error('\n❌ Error en la migración:', error.message);
    if (connection) await connection.end();
    process.exit(1);
  }
}

runMigration();

const pool = require('./src/config/db');

(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS permisos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        codigo VARCHAR(50) NOT NULL UNIQUE,
        descripcion VARCHAR(100) NOT NULL
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS rol_permisos (
        rol_id INT,
        permiso_id INT,
        PRIMARY KEY (rol_id, permiso_id),
        FOREIGN KEY (rol_id) REFERENCES roles(id) ON DELETE CASCADE,
        FOREIGN KEY (permiso_id) REFERENCES permisos(id) ON DELETE CASCADE
      )
    `);

    // ─── PERMISOS ORGANIZADOS POR MÓDULO ─────────────────────────────
    const permisos = [
      // 📊 Dashboard
      ['view_dashboard',      'Acceso al Dashboard'],

      // 📦 Inventario
      ['manage_inventario',   'Gestión de Inventario (Almacén, Catálogos, Tienda)'],

      // 🛒 Ventas
      ['manage_ventas',       'Gestión de Ventas y Caja'],

      // 📋 Cotizaciones
      ['manage_cotizaciones', 'Gestión de Cotizaciones'],

      // 💰 Movimientos / Caja
      ['manage_caja',         'Gestión de Movimientos y Caja'],

      // 📈 Reportes
      ['view_reportes',       'Acceso a Reportes'],

      // 👥 Clientes
      ['manage_clientes',     'Gestión de Clientes'],

      // 🚚 Proveedores
      ['manage_proveedores',  'Gestión de Proveedores y Compras a Crédito'],

      // 👤 Usuarios
      ['manage_usuarios',     'Gestión de Usuarios'],

      // 🔐 Roles
      ['manage_roles',        'Gestión de Roles'],

      // 🔑 Permisos
      ['manage_permisos',     'Gestión de Permisos'],

      // 📝 Auditoría
      ['view_auditoria',      'Acceso a Auditoría'],
    ];

    for (const [codigo, desc] of permisos) {
      await pool.query('INSERT IGNORE INTO permisos (codigo, descripcion) VALUES (?, ?)', [codigo, desc]);
    }

    console.log(`✅ ${permisos.length} permisos sincronizados.`);

    // Asignar TODOS los permisos al rol Administrador
    const [roles] = await pool.query('SELECT id FROM roles WHERE nombre = ?', ['Administrador']);
    if (roles.length > 0) {
      const adminId = roles[0].id;
      const [allPermisos] = await pool.query('SELECT id FROM permisos');
      for (const p of allPermisos) {
        await pool.query('INSERT IGNORE INTO rol_permisos (rol_id, permiso_id) VALUES (?, ?)', [adminId, p.id]);
      }
      console.log(`✅ ${allPermisos.length} permisos asignados al Administrador.`);
    } else {
      console.log('⚠️  No se encontró el rol Administrador.');
    }

    console.log('\n📋 Resumen de permisos por módulo:');
    console.log('─'.repeat(55));
    const [all] = await pool.query('SELECT codigo, descripcion FROM permisos ORDER BY id');
    for (const p of all) {
      console.log(`  ${p.codigo.padEnd(22)} → ${p.descripcion}`);
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
})();

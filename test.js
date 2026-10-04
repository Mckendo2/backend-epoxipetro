const pool = require('./src/config/db');
async function run() {
  // Verificar alertas con el nuevo filtro
  const [alertas] = await pool.query(`
    SELECT p.nombre AS prod, pr.nombre AS pres, it.cantidad, it.cantidad_minima
    FROM inventario_tienda it
    JOIN presentaciones pr ON it.presentacion_id = pr.id AND pr.estado = 1
    JOIN productos p ON pr.producto_id = p.id AND p.estado = 1
    WHERE it.cantidad <= it.cantidad_minima AND it.cantidad_minima > 0
    ORDER BY it.cantidad ASC
  `);
  console.log('Alertas activas (con filtro):', alertas.length);
  alertas.slice(0, 10).forEach(a => console.log(a.prod, '-', a.pres, ':', parseFloat(a.cantidad)));

  // Ver qué tiene Embutido Everleo 002AB
  const [everleo] = await pool.query(`
    SELECT pr.id, pr.estado, p.estado as p_estado, it.cantidad, it.cantidad_minima
    FROM inventario_tienda it
    JOIN presentaciones pr ON it.presentacion_id = pr.id
    JOIN productos p ON pr.producto_id = p.id
    WHERE p.nombre LIKE '%Everleo%' OR pr.nombre LIKE '%Everleo%' OR pr.codigo_barras = '002AB'
  `);
  console.log('Embutido Everleo en BD:', everleo);

  process.exit(0);
}
run().catch(console.error);

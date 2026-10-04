require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const pool = require('../src/config/db');

async function fix() {
  try {
    console.log('Corrigiendo stock de Venta #25...\n');

    const [r1] = await pool.query('UPDATE inventario_tienda SET cantidad = cantidad - 1 WHERE presentacion_id = 6');
    const [r2] = await pool.query('UPDATE inventario_tienda SET cantidad = cantidad - 1 WHERE presentacion_id = 1');

    console.log('PICAPORTE (presentacion_id=6)  → filas afectadas:', r1.affectedRows);
    console.log('chapa yale (presentacion_id=1) → filas afectadas:', r2.affectedRows);

    const [stocks] = await pool.query(`
      SELECT p.nombre AS producto, pr.nombre AS presentacion, it.cantidad AS stock_tienda
      FROM inventario_tienda it
      JOIN presentaciones pr ON it.presentacion_id = pr.id
      JOIN productos p       ON pr.producto_id = p.id
      WHERE it.presentacion_id IN (1, 6)
    `);

    console.log('\nStock corregido:');
    stocks.forEach(s =>
      console.log('  ' + s.producto + ' (' + s.presentacion + '): ' + s.stock_tienda + ' unidades en tienda')
    );

    console.log('\n✅ Corrección aplicada exitosamente.');
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    pool.end();
  }
}

fix();

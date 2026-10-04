/**
 * Verifica cuáles ventas descontaron el stock y cuáles no.
 * Compara detalle_ventas con movimientos_stock tipo salida_venta.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const pool = require('../src/config/db');

async function main() {
  try {
    // Ventas con sus ítems vs movimientos registrados
    const [filas] = await pool.query(`
      SELECT
        v.id AS venta_id,
        v.created_at,
        v.estado,
        v.total,
        dv.presentacion_id,
        p.nombre  AS producto,
        pr.nombre AS presentacion,
        dv.cantidad AS cant_vendida,
        (
          SELECT SUM(ms.cantidad)
          FROM movimientos_stock ms
          JOIN tipos_movimiento tm ON ms.tipo_movimiento_id = tm.id
          WHERE ms.presentacion_id = dv.presentacion_id
            AND tm.codigo = 'salida_venta'
            AND ms.nota = CONCAT('Venta #', v.id)
        ) AS cant_descontada
      FROM ventas v
      JOIN detalle_ventas dv ON dv.venta_id = v.id
      JOIN presentaciones pr ON dv.presentacion_id = pr.id
      JOIN productos p ON pr.producto_id = p.id
      WHERE v.estado = 'completada'
      ORDER BY v.id DESC
      LIMIT 50
    `);

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  ESTADO DE DESCUENTO DE STOCK POR VENTA');
    console.log('═══════════════════════════════════════════════════════════════\n');

    let sinDescuento = [];

    filas.forEach(f => {
      const descontado = parseFloat(f.cant_descontada || 0);
      const vendido    = parseFloat(f.cant_vendida);
      const ok         = descontado >= vendido;

      const fecha = new Date(f.created_at).toLocaleString('es-BO');
      const estado = ok ? '✅' : '❌ SIN DESCUENTO';

      console.log(`${estado} | Venta #${f.venta_id} | ${fecha} | ${f.producto} (${f.presentacion}) | Vendido: ${vendido} | Descontado del stock: ${descontado}`);

      if (!ok) {
        sinDescuento.push({
          venta_id: f.venta_id,
          presentacion_id: f.presentacion_id,
          producto: `${f.producto} (${f.presentacion})`,
          faltante: vendido - descontado,
        });
      }
    });

    if (sinDescuento.length === 0) {
      console.log('\n🎉 TODAS las ventas tienen su stock descontado correctamente.\n');
    } else {
      console.log('\n⚠️  Las siguientes ventas NO descontaron stock:\n');
      sinDescuento.forEach(s => {
        console.log(`  → Venta #${s.venta_id} | ${s.producto} | Falta descontar: ${s.faltante} unidades`);
        console.log(`    SQL para corregir manualmente:`);
        console.log(`    UPDATE inventario_tienda SET cantidad = cantidad - ${s.faltante} WHERE presentacion_id = ${s.presentacion_id};\n`);
      });
    }

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    pool.end();
  }
}

main();

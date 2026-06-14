const pool = require('../config/db');
const xlsx = require('xlsx');
const ExcelJS = require('exceljs');

// --- Catálogos ---
exports.obtenerCatalogos = async (req, res) => {
  try {
    const [[categorias], [marcas], [unidades]] = await Promise.all([
      pool.query(`SELECT id, nombre, descripcion FROM categorias ORDER BY nombre`),
      pool.query(`SELECT id, nombre FROM marcas ORDER BY nombre`),
      pool.query(`SELECT id, nombre, abreviatura FROM unidades_medida ORDER BY nombre`)
    ]);
    res.json({ categorias, marcas, unidades });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al obtener catálogos' });
  }
};

exports.crearCategoria = async (req, res) => {
  try {
    const { nombre, descripcion } = req.body;
    if (!nombre) return res.status(400).json({ mensaje: 'El nombre es obligatorio' });
    const [resultado] = await pool.query('INSERT INTO categorias (nombre, descripcion) VALUES (?, ?)', [nombre, descripcion || null]);
    res.status(201).json({ mensaje: 'Categoría creada', id: resultado.insertId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al crear categoría' });
  }
};

exports.editarCategoria = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, descripcion } = req.body;
    if (!nombre) return res.status(400).json({ mensaje: 'El nombre es obligatorio' });
    const [resultado] = await pool.query('UPDATE categorias SET nombre = ?, descripcion = ? WHERE id = ?', [nombre, descripcion || null, id]);
    if (resultado.affectedRows === 0) return res.status(404).json({ mensaje: 'Categoría no encontrada' });
    res.json({ mensaje: 'Categoría actualizada' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al actualizar categoría' });
  }
};

exports.eliminarCategoria = async (req, res) => {
  try {
    const { id } = req.params;
    const [resultado] = await pool.query('DELETE FROM categorias WHERE id = ?', [id]);
    if (resultado.affectedRows === 0) return res.status(404).json({ mensaje: 'Categoría no encontrada' });
    res.json({ mensaje: 'Categoría eliminada' });
  } catch (error) {
    if (error.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(400).json({ mensaje: 'No se puede eliminar porque hay productos usando esta categoría' });
    }
    console.error(error);
    res.status(500).json({ mensaje: 'Error al eliminar categoría' });
  }
};

exports.crearMarca = async (req, res) => {
  try {
    const { nombre } = req.body;
    if (!nombre) return res.status(400).json({ mensaje: 'El nombre es obligatorio' });
    const [resultado] = await pool.query('INSERT INTO marcas (nombre) VALUES (?)', [nombre]);
    res.status(201).json({ mensaje: 'Marca creada', id: resultado.insertId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al crear marca' });
  }
};

exports.editarMarca = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre } = req.body;
    if (!nombre) return res.status(400).json({ mensaje: 'El nombre es obligatorio' });
    const [resultado] = await pool.query('UPDATE marcas SET nombre = ? WHERE id = ?', [nombre, id]);
    if (resultado.affectedRows === 0) return res.status(404).json({ mensaje: 'Marca no encontrada' });
    res.json({ mensaje: 'Marca actualizada' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al actualizar marca' });
  }
};

exports.eliminarMarca = async (req, res) => {
  try {
    const { id } = req.params;
    const [resultado] = await pool.query('DELETE FROM marcas WHERE id = ?', [id]);
    if (resultado.affectedRows === 0) return res.status(404).json({ mensaje: 'Marca no encontrada' });
    res.json({ mensaje: 'Marca eliminada' });
  } catch (error) {
    if (error.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(400).json({ mensaje: 'No se puede eliminar porque hay productos usando esta marca' });
    }
    console.error(error);
    res.status(500).json({ mensaje: 'Error al eliminar marca' });
  }
};

// --- Productos ---
exports.obtenerProductos = async (req, res) => {
  try {
    const [filas] = await pool.query(`
      SELECT
        p.id, p.nombre, p.descripcion, p.imagen_url, p.estado, p.created_at,
        p.categoria_id, p.marca_id,
        c.nombre AS categoria, m.nombre AS marca,
        pr.id AS presentacion_id,
        pr.nombre AS presentacion_nombre,
        pr.codigo_barras, pr.sku,
        pr.cantidad_unidad, pr.precio_compra, pr.precio_venta,
        u.abreviatura AS unidad,
        COALESCE(it.cantidad, 0) AS stock_tienda,
        COALESCE(ia.cantidad, 0) AS stock_almacen,
        COALESCE(it.cantidad_minima, 0) AS stock_minimo,
        (
          SELECT COALESCE(SUM(dv.cantidad), 0)
          FROM detalle_ventas dv
          JOIN ventas v ON dv.venta_id = v.id
          WHERE dv.presentacion_id = pr.id
          AND v.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
          AND v.estado = 'completada'
        ) AS ventas_30_dias
      FROM productos p
      LEFT JOIN categorias c ON p.categoria_id = c.id
      LEFT JOIN marcas m ON p.marca_id = m.id
      LEFT JOIN presentaciones pr ON pr.producto_id = p.id
      LEFT JOIN unidades_medida u ON pr.unidad_medida_id = u.id
      LEFT JOIN inventario_tienda it ON it.presentacion_id = pr.id
      LEFT JOIN inventario_almacen ia ON ia.presentacion_id = pr.id
      WHERE p.estado = true
      ORDER BY p.nombre, pr.cantidad_unidad
    `);

    // Agrupar presentaciones bajo el producto padre
    const mapa = {};
    filas.forEach(f => {
      if (!mapa[f.id]) {
        mapa[f.id] = {
          id: f.id, nombre: f.nombre, descripcion: f.descripcion,
          categoria_id: f.categoria_id, marca_id: f.marca_id,
          categoria: f.categoria, marca: f.marca, imagen_url: f.imagen_url, created_at: f.created_at,
          presentaciones: []
        };
      }
      if (f.presentacion_id) {
        const margen = f.precio_venta > 0
          ? (((f.precio_venta - f.precio_compra) / f.precio_venta) * 100).toFixed(1)
          : 0;
        mapa[f.id].presentaciones.push({
          id: f.presentacion_id,
          nombre: f.presentacion_nombre,
          codigo_barras: f.codigo_barras,
          sku: f.sku,
          unidad: f.unidad,
          cantidad_unidad: f.cantidad_unidad,
          precio_compra: f.precio_compra,
          precio_venta: f.precio_venta,
          margen_ganancia: parseFloat(margen),
          stock_tienda: parseFloat(f.stock_tienda),
          stock_almacen: parseFloat(f.stock_almacen),
          stock_minimo: parseFloat(f.stock_minimo),
          ventas_30_dias: parseFloat(f.ventas_30_dias || 0)
        });
      }
    });
    res.json(Object.values(mapa));
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al obtener productos' });
  }
};

exports.crearProducto = async (req, res) => {
  try {
    const { nombre, descripcion, categoria_id, marca_id } = req.body;
    let imagen_url = req.body.imagen_url || null;
    
    if (req.file) {
      imagen_url = `/uploads/${req.file.filename}`;
    }

    if (!nombre) return res.status(400).json({ mensaje: 'El nombre del producto es obligatorio' });

    const [resultado] = await pool.query(
      `INSERT INTO productos (nombre, descripcion, categoria_id, marca_id, imagen_url) VALUES (?, ?, ?, ?, ?)`,
      [nombre, descripcion, categoria_id || null, marca_id || null, imagen_url]
    );
    res.status(201).json({ mensaje: 'Producto creado exitosamente', id: resultado.insertId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al crear el producto' });
  }
};

exports.editarProducto = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, descripcion, categoria_id, marca_id } = req.body;
    let imagen_url = req.body.imagen_url || null;
    
    if (!nombre) return res.status(400).json({ mensaje: 'El nombre del producto es obligatorio' });

    let query = `UPDATE productos SET nombre = ?, descripcion = ?, categoria_id = ?, marca_id = ?`;
    let params = [nombre, descripcion, categoria_id || null, marca_id || null];

    if (req.file) {
      query += `, imagen_url = ?`;
      params.push(`/uploads/${req.file.filename}`);
    }

    query += ` WHERE id = ?`;
    params.push(id);

    const [resultado] = await pool.query(query, params);
    
    if (resultado.affectedRows === 0) return res.status(404).json({ mensaje: 'Producto no encontrado' });
    res.json({ mensaje: 'Producto actualizado exitosamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al actualizar el producto' });
  }
};

// --- Presentaciones ---
exports.crearPresentacion = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { producto_id, nombre, codigo_barras, sku, unidad_medida_id, cantidad_unidad, precio_compra, precio_venta } = req.body;
    if (!producto_id || !nombre || !precio_venta) {
      return res.status(400).json({ mensaje: 'producto_id, nombre y precio_venta son obligatorios' });
    }

    await conn.beginTransaction();

    const [res1] = await conn.query(
      `INSERT INTO presentaciones (producto_id, nombre, codigo_barras, sku, unidad_medida_id, cantidad_unidad, precio_compra, precio_venta)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [producto_id, nombre, codigo_barras || null, sku || null, unidad_medida_id || null, cantidad_unidad || 1, precio_compra || 0, precio_venta]
    );
    const presentacion_id = res1.insertId;

    // Inicializar filas de stock en 0 automáticamente
    await conn.query(`INSERT INTO inventario_tienda (presentacion_id, cantidad, cantidad_minima) VALUES (?, 0, 0)`, [presentacion_id]);
    await conn.query(`INSERT INTO inventario_almacen (presentacion_id, cantidad) VALUES (?, 0)`, [presentacion_id]);

    await conn.commit();
    res.status(201).json({ mensaje: 'Presentación creada exitosamente', id: presentacion_id });
  } catch (error) {
    await conn.rollback();
    console.error(error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ mensaje: 'El código de barras o SKU ya existe en el sistema' });
    }
    res.status(500).json({ mensaje: 'Error al crear la presentación' });
  } finally {
    conn.release();
  }
};

exports.editarPresentacion = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, codigo_barras, sku, unidad_medida_id, precio_compra, precio_venta } = req.body;
    
    if (!nombre || !precio_venta) {
      return res.status(400).json({ mensaje: 'Nombre y precio de venta son obligatorios' });
    }

    const [resultado] = await pool.query(
      `UPDATE presentaciones 
       SET nombre = ?, codigo_barras = ?, sku = ?, unidad_medida_id = ?, precio_compra = ?, precio_venta = ?
       WHERE id = ?`,
      [nombre, codigo_barras || null, sku || null, unidad_medida_id || null, precio_compra || 0, precio_venta, id]
    );

    if (resultado.affectedRows === 0) {
      return res.status(404).json({ mensaje: 'Presentación no encontrada' });
    }

    res.json({ mensaje: 'Presentación actualizada exitosamente' });
  } catch (error) {
    console.error(error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ mensaje: 'El código de barras o SKU ya está en uso por otra presentación' });
    }
    res.status(500).json({ mensaje: 'Error al actualizar la presentación' });
  }
};

// --- Scanner ---
exports.buscarPorCodigo = async (req, res) => {
  try {
    const { codigo } = req.params;
    const [filas] = await pool.query(`
      SELECT pr.id, pr.nombre AS presentacion, pr.precio_venta, pr.codigo_barras, pr.sku,
             p.nombre AS producto, p.id AS producto_id,
             COALESCE(it.cantidad, 0) AS stock_tienda
      FROM presentaciones pr
      JOIN productos p ON pr.producto_id = p.id
      LEFT JOIN inventario_tienda it ON it.presentacion_id = pr.id
      WHERE pr.codigo_barras = ? OR pr.sku = ?
    `, [codigo, codigo]);

    if (!filas.length) return res.status(404).json({ mensaje: 'Producto no encontrado' });
    res.json(filas[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error en la búsqueda' });
  }
};

// --- Movimientos ---
exports.entradaAlmacen = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { presentacion_id, cantidad, usuario_id, nota } = req.body;
    if (!presentacion_id || !cantidad || cantidad <= 0) {
      return res.status(400).json({ mensaje: 'presentacion_id y cantidad son obligatorios' });
    }

    await conn.beginTransaction();

    const [[ia]] = await conn.query(`SELECT cantidad FROM inventario_almacen WHERE presentacion_id = ?`, [presentacion_id]);
    const [[it]] = await conn.query(`SELECT cantidad FROM inventario_tienda WHERE presentacion_id = ?`, [presentacion_id]);
    const [[tm]] = await conn.query(`SELECT id FROM tipos_movimiento WHERE codigo = 'entrada_almacen'`);

    await conn.query(
      `INSERT INTO movimientos_stock (tipo_movimiento_id, presentacion_id, cantidad, stock_tienda_antes, stock_almacen_antes, usuario_id, nota)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [tm.id, presentacion_id, cantidad, it?.cantidad ?? 0, ia?.cantidad ?? 0, usuario_id ?? null, nota ?? null]
    );
    await conn.query(`UPDATE inventario_almacen SET cantidad = cantidad + ? WHERE presentacion_id = ?`, [cantidad, presentacion_id]);

    await conn.commit();
    res.json({ mensaje: 'Entrada registrada en almacén' });
  } catch (error) {
    await conn.rollback();
    console.error(error);
    res.status(500).json({ mensaje: 'Error al registrar la entrada' });
  } finally {
    conn.release();
  }
};

exports.trasladarATienda = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { presentacion_id, cantidad, usuario_id, nota } = req.body;
    if (!presentacion_id || !cantidad || cantidad <= 0) {
      return res.status(400).json({ mensaje: 'presentacion_id y cantidad son obligatorios' });
    }

    await conn.beginTransaction();

    const [[ia]] = await conn.query(`SELECT cantidad FROM inventario_almacen WHERE presentacion_id = ?`, [presentacion_id]);
    if (!ia || parseFloat(ia.cantidad) < cantidad) {
      await conn.rollback();
      return res.status(400).json({ mensaje: 'Stock insuficiente en almacén' });
    }

    const [[it]] = await conn.query(`SELECT cantidad FROM inventario_tienda WHERE presentacion_id = ?`, [presentacion_id]);
    const [[tm]] = await conn.query(`SELECT id FROM tipos_movimiento WHERE codigo = 'traslado_a_tienda'`);

    await conn.query(
      `INSERT INTO movimientos_stock (tipo_movimiento_id, presentacion_id, cantidad, stock_tienda_antes, stock_almacen_antes, usuario_id, nota)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [tm.id, presentacion_id, cantidad, it?.cantidad ?? 0, ia.cantidad, usuario_id ?? null, nota ?? null]
    );
    await conn.query(`UPDATE inventario_almacen SET cantidad = cantidad - ? WHERE presentacion_id = ?`, [cantidad, presentacion_id]);
    await conn.query(`UPDATE inventario_tienda SET cantidad = cantidad + ? WHERE presentacion_id = ?`, [cantidad, presentacion_id]);

    await conn.commit();
    res.json({ mensaje: 'Traslado registrado exitosamente' });
  } catch (error) {
    await conn.rollback();
    console.error(error);
    res.status(500).json({ mensaje: 'Error al realizar el traslado' });
  } finally {
    conn.release();
  }
};

exports.obtenerMovimientos = async (req, res) => {
  try {
    const limite = parseInt(req.query.limite) || 50;
    const [filas] = await pool.query(`
      SELECT ms.id, ms.cantidad, ms.nota, ms.created_at,
             tm.descripcion AS tipo, tm.codigo AS tipo_codigo,
             pr.nombre AS presentacion, p.nombre AS producto,
             u.nombre AS usuario
      FROM movimientos_stock ms
      JOIN tipos_movimiento tm ON ms.tipo_movimiento_id = tm.id
      JOIN presentaciones pr ON ms.presentacion_id = pr.id
      JOIN productos p ON pr.producto_id = p.id
      LEFT JOIN usuarios u ON ms.usuario_id = u.id
      ORDER BY ms.created_at DESC
      LIMIT ?
    `, [limite]);
    res.json(filas);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al obtener movimientos' });
  }
};

// ======================= EXCEL EXPORT/IMPORT =======================

exports.exportarExcel = async (req, res) => {
  try {
    const [filas] = await pool.query(`
      SELECT p.nombre AS producto, pr.nombre AS presentacion, pr.precio_venta, 
             ia.cantidad AS stock, c.nombre AS categoria, pr.precio_compra, 
             pr.codigo_barras, p.descripcion
      FROM productos p
      JOIN presentaciones pr ON p.id = pr.producto_id
      LEFT JOIN inventario_almacen ia ON pr.id = ia.presentacion_id
      LEFT JOIN categorias c ON p.categoria_id = c.id
      ORDER BY p.nombre ASC
    `);

    const workbook = new ExcelJS.Workbook();
    // Congelar las primeras 5 filas para que siempre se vean las cabeceras
    const worksheet = workbook.addWorksheet('Inventario', { views: [{ state: 'frozen', ySplit: 5 }] });

    // Definir el ancho de las columnas
    worksheet.columns = [
      { width: 45 }, // Nombre
      { width: 22 }, // Precio de venta
      { width: 25 }, // Unidades disponibles
      { width: 25 }, // Categoría
      { width: 22 }, // Costo
      { width: 28 }, // Codigo de barras
      { width: 50 }  // Descripcion
    ];

    // Fila 1: Título Principal
    worksheet.mergeCells('A1:G1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = 'Importación Masiva de Inventario';
    titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    worksheet.getRow(1).height = 30;

    // Fila 2: Instrucciones
    worksheet.mergeCells('A2:G2');
    const instructionsCell = worksheet.getCell('A2');
    instructionsCell.value = 'Instrucciones: Completa esta plantilla con las indicaciones de cada columna. Recuerda que las primeras 3 columnas son obligatorias para importar tus productos sin problemas.';
    instructionsCell.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF000000' } };
    instructionsCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
    instructionsCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    worksheet.getRow(2).height = 40;

    // Fila 3: Separadores de Obligatoriedad
    worksheet.mergeCells('A3:C3');
    const oblCell = worksheet.getCell('A3');
    oblCell.value = 'OBLIGATORIO*';
    oblCell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFC00000' } };
    oblCell.alignment = { horizontal: 'center' };

    worksheet.mergeCells('D3:G3');
    const opcCell = worksheet.getCell('D3');
    opcCell.value = 'OPCIONAL';
    opcCell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF548235' } };
    opcCell.alignment = { horizontal: 'center' };

    // Fila 4: Instrucciones de Columnas
    worksheet.getRow(4).values = [
      'Ingresa el nombre del producto.',
      'Ingresa el precio de venta del producto.',
      'Ingresa la cantidad disponible de tu producto.',
      '¿A qué categoría pertenece tu producto?',
      '¿Cuánto te cuesta comprar este producto?',
      'Ingresa el código de barras de tu producto o su código único.',
      'Escribe la información adicional relacionada con el producto.'
    ];
    worksheet.getRow(4).font = { name: 'Arial', size: 9, italic: true };
    worksheet.getRow(4).alignment = { wrapText: true, vertical: 'top' };
    worksheet.getRow(4).height = 45;

    // Fila 5: Restricciones
    worksheet.getRow(5).values = [
      '* Ingresa máx 500 caracteres.',
      ' *Solo puedes usar números y comas, no puedes usar puntos.',
      ' *Solo puedes usar números y comas, no puedes usar puntos.',
      '*Escoge una de tu lista de categorías actual o ingresa una nueva.',
      ' *Solo puedes usar números y comas, no puedes usar puntos.',
      '*Asegúrate de no dejar espacios dentro del código.',
      '* Ingresa máx 500 caracteres.'
    ];
    worksheet.getRow(5).font = { name: 'Arial', size: 9, color: { argb: 'FF595959' } };
    worksheet.getRow(5).alignment = { wrapText: true, vertical: 'top' };
    worksheet.getRow(5).height = 45;

    // Fila 6: Cabeceras de Tabla
    worksheet.getRow(6).values = [
      'Nombre *', 'Precio de venta *', 'Unidades disponibles *',
      'Categoría', 'Costo del producto', 'Código de barras o SKU', 'Descripción'
    ];
    worksheet.getRow(6).font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF305496' } };
    worksheet.getRow(6).alignment = { vertical: 'middle', horizontal: 'center' };
    worksheet.getRow(6).height = 25;

    // Aplicar bordes suaves a las cabeceras explicativas
    for (let r = 3; r <= 6; r++) {
      worksheet.getRow(r).eachCell({ includeEmpty: false }, (cell) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFBFBFBF' } },
          left: { style: 'thin', color: { argb: 'FFBFBFBF' } },
          bottom: { style: 'thin', color: { argb: 'FFBFBFBF' } },
          right: { style: 'thin', color: { argb: 'FFBFBFBF' } }
        };
      });
    }

    // Insertar Datos
    filas.forEach(f => {
      const nombreFinal = (f.presentacion && f.presentacion !== 'Unidad' && f.presentacion !== 'General') 
        ? `${f.producto} - ${f.presentacion}` 
        : f.producto;

      const row = worksheet.addRow([
        nombreFinal,
        Number(f.precio_venta) || 0,
        Number(f.stock) || 0,
        f.categoria || '',
        Number(f.precio_compra) || 0,
        f.codigo_barras || '',
        f.descripcion || ''
      ]);

      // Formato numérico para precios y cantidades
      row.getCell(2).numFmt = '#,##0.00';
      row.getCell(3).numFmt = '#,##0.00';
      row.getCell(5).numFmt = '#,##0.00';
      row.font = { name: 'Arial', size: 10 };
      row.alignment = { vertical: 'middle' };
    });

    res.setHeader('Content-Disposition', 'attachment; filename="Plantilla_Inventario.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error exportando Excel:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor al exportar Excel' });
  }
};

exports.importarExcel = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ mensaje: 'No se subió ningún archivo' });
  }

  const conn = await pool.getConnection();
  try {
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });

    // Los datos reales empiezan en la fila 6 (índice 5 en el array)
    const rows = data.slice(5);

    await conn.beginTransaction();

    let insertados = 0;
    let actualizados = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue; // Fila vacía

      const nombre = row[0] ? String(row[0]).trim() : '';
      let precio_venta = parseFloat(row[1]) || 0;
      let stock = parseFloat(row[2]) || 0;
      const categoria_nombre = row[3] ? String(row[3]).trim() : '';
      let precio_compra = parseFloat(row[4]) || 0;
      const codigo_barras = row[5] ? String(row[5]).trim() : null;
      const descripcion = row[6] ? String(row[6]).trim() : null;

      if (!nombre) continue; // Si no hay nombre, saltamos la fila

      // 1. Manejar la Categoría
      let categoria_id = null;
      if (categoria_nombre) {
        const [cats] = await conn.query('SELECT id FROM categorias WHERE nombre = ?', [categoria_nombre]);
        if (cats.length > 0) {
          categoria_id = cats[0].id;
        } else {
          const [resCat] = await conn.query('INSERT INTO categorias (nombre) VALUES (?)', [categoria_nombre]);
          categoria_id = resCat.insertId;
        }
      }

      // 2. Buscar Producto por Código de Barras o Nombre
      let producto_id = null;
      let presentacion_id = null;
      let productoExiste = false;

      // Buscar por código de barras primero
      if (codigo_barras) {
        const [pres] = await conn.query('SELECT id, producto_id FROM presentaciones WHERE codigo_barras = ?', [codigo_barras]);
        if (pres.length > 0) {
          presentacion_id = pres[0].id;
          producto_id = pres[0].producto_id;
          productoExiste = true;
        }
      }

      // Si no se encontró por código, buscar por nombre exacto de producto
      if (!producto_id) {
        const [prods] = await conn.query('SELECT id FROM productos WHERE nombre = ?', [nombre]);
        if (prods.length > 0) {
          producto_id = prods[0].id;
          
          // Buscar si tiene la presentación "Unidad", sino, tomar la primera que exista
          const [pres] = await conn.query('SELECT id FROM presentaciones WHERE producto_id = ? AND nombre = "Unidad"', [producto_id]);
          if (pres.length > 0) {
            presentacion_id = pres[0].id;
          } else {
            const [pres2] = await conn.query('SELECT id FROM presentaciones WHERE producto_id = ? LIMIT 1', [producto_id]);
            if (pres2.length > 0) presentacion_id = pres2[0].id;
          }
          productoExiste = true;
        }
      }

      if (productoExiste && presentacion_id) {
        // ACTUALIZAR (REEMPLAZAR STOCK)
        await conn.query(
          `UPDATE productos SET descripcion = COALESCE(?, descripcion), categoria_id = COALESCE(?, categoria_id) WHERE id = ?`,
          [descripcion, categoria_id, producto_id]
        );
        await conn.query(
          `UPDATE presentaciones SET precio_venta = ?, precio_compra = ?, codigo_barras = COALESCE(?, codigo_barras) WHERE id = ?`,
          [precio_venta, precio_compra, codigo_barras, presentacion_id]
        );
        // REEMPLAZAR STOCK ALMACÉN
        await conn.query(`UPDATE inventario_almacen SET cantidad = ? WHERE presentacion_id = ?`, [stock, presentacion_id]);
        
        actualizados++;
      } else {
        // CREAR NUEVO
        const [resProd] = await conn.query(
          `INSERT INTO productos (nombre, descripcion, categoria_id) VALUES (?, ?, ?)`,
          [nombre, descripcion, categoria_id]
        );
        producto_id = resProd.insertId;

        const [resPres] = await conn.query(
          `INSERT INTO presentaciones (producto_id, nombre, codigo_barras, precio_compra, precio_venta, cantidad_unidad) 
           VALUES (?, 'Unidad', ?, ?, ?, 1)`,
          [producto_id, codigo_barras, precio_compra, precio_venta]
        );
        presentacion_id = resPres.insertId;

        await conn.query(`INSERT INTO inventario_tienda (presentacion_id, cantidad, cantidad_minima) VALUES (?, 0, 0)`, [presentacion_id]);
        await conn.query(`INSERT INTO inventario_almacen (presentacion_id, cantidad) VALUES (?, ?)`, [presentacion_id, stock]);
        
        insertados++;
      }
    }

    await conn.commit();
    res.json({ mensaje: `Importación exitosa. Creados: ${insertados}, Actualizados: ${actualizados}` });

  } catch (error) {
    await conn.rollback();
    console.error('Error importando Excel:', error);
    res.status(500).json({ mensaje: 'Error procesando el archivo de Excel' });
  } finally {
    conn.release();
  }
};

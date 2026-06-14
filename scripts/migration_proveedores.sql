-- ============================================================
-- MIGRACIÓN: Módulo de Proveedores
-- Tablas: proveedores, compras_proveedor, pagos_proveedor
-- ============================================================

CREATE TABLE IF NOT EXISTS proveedores (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  nombre      VARCHAR(200) NOT NULL,
  contacto    VARCHAR(150),
  telefono    VARCHAR(30),
  correo      VARCHAR(120),
  direccion   VARCHAR(300),
  ruc_nit     VARCHAR(50),
  activo      BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS compras_proveedor (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  proveedor_id      INT NOT NULL,
  usuario_id        INT,
  descripcion       VARCHAR(500) NOT NULL,
  monto             DECIMAL(12,2) NOT NULL,
  tipo_pago         ENUM('credito','contado') DEFAULT 'credito',
  estado_pago       ENUM('pendiente','parcial','pagado') DEFAULT 'pendiente',
  fecha_vencimiento DATE,
  nota              TEXT,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (proveedor_id) REFERENCES proveedores(id) ON DELETE CASCADE,
  FOREIGN KEY (usuario_id)   REFERENCES usuarios(id)   ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS pagos_proveedor (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  compra_id   INT NOT NULL,
  monto       DECIMAL(12,2) NOT NULL,
  metodo_pago ENUM('efectivo','transferencia','cheque','otro') DEFAULT 'efectivo',
  nota        VARCHAR(300),
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (compra_id) REFERENCES compras_proveedor(id) ON DELETE CASCADE
);

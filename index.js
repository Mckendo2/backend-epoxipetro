const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Importar rutas
const usuarioRoutes = require('./src/routes/usuario.routes');
const clienteRoutes = require('./src/routes/cliente.routes');
const inventarioRoutes = require('./src/routes/inventario.routes');
const ventasRoutes = require('./src/routes/ventas.routes');
const gastosRoutes = require('./src/routes/gastos.routes');
const rolesRoutes = require('./src/routes/roles.routes');
const dashboardRoutes = require('./src/routes/dashboard.routes');
const authRoutes = require('./src/routes/auth.routes');
const auditoriaRoutes = require('./src/routes/auditoria.routes');
const permisosRoutes = require('./src/routes/permisos.routes');
const reportesRoutes = require('./src/routes/reportes.routes');
const publicRoutes = require('./src/routes/public.routes');
const cotizacionesRoutes = require('./src/routes/cotizaciones.routes');
const proveedoresRoutes = require('./src/routes/proveedores.routes');
const { verificarToken } = require('./src/middlewares/auth.middleware');
const { auditLogger } = require('./src/middlewares/audit.middleware');

// Rutas Públicas
app.use('/api/auth', authRoutes);
app.use('/api/public', publicRoutes);

// Rutas Protegidas (Requieren token y registran auditoría)
app.use(verificarToken);
app.use(auditLogger);
app.use('/api/usuarios', usuarioRoutes);
app.use('/api/clientes', clienteRoutes);
app.use('/api/inventario', inventarioRoutes);
app.use('/api/ventas', ventasRoutes);
app.use('/api/cotizaciones', cotizacionesRoutes);
app.use('/api/gastos', gastosRoutes);
app.use('/api/roles', rolesRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/auditoria', auditoriaRoutes);
app.use('/api/permisos', permisosRoutes);
app.use('/api/reportes', reportesRoutes);
app.use('/api/proveedores', proveedoresRoutes);

app.get('/', (req, res) => {
  res.json({ message: 'Backend is running!' });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

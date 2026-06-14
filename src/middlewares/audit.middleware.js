const pool = require('../config/db');

exports.auditLogger = async (req, res, next) => {
  // Solo interceptamos si no es GET (así evitamos saturar de registros de lectura)
  // Opciones: se podría interceptar GETs de ciertas rutas, pero lo común es registrar modificaciones
  
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    // Escuchar cuando la respuesta termina para registrar
    res.on('finish', async () => {
      // Ignoramos el login aquí porque lo registramos manual en el auth.controller (ya que allí sabemos si fue exitoso)
      if (req.originalUrl.includes('/api/auth/login')) return;

      const usuarioId = req.usuario ? req.usuario.id : null;
      const metodo = req.method;
      const ruta = req.originalUrl;
      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
      
      // Intentar adivinar la acción basada en el método y ruta
      let accion = '-';
      if (metodo === 'POST') accion = 'Creación de registro';
      if (metodo === 'PUT' || metodo === 'PATCH') accion = 'Actualización de registro';
      if (metodo === 'DELETE') accion = 'Eliminación de registro';

      // Capturar body seguro (quitamos contraseñas si hay)
      let detallesStr = null;
      if (req.body && Object.keys(req.body).length > 0) {
        const safeBody = { ...req.body };
        delete safeBody.contraseña;
        delete safeBody.password;
        detallesStr = JSON.stringify(safeBody);
      }

      try {
        await pool.query(
          `INSERT INTO auditoria (usuario_id, metodo, ruta, accion, ip, detalles) VALUES (?, ?, ?, ?, ?, ?)`,
          [usuarioId, metodo, ruta, accion, ip, detallesStr]
        );
      } catch (err) {
        console.error('Error registrando auditoría:', err);
      }
    });
  }
  
  next();
};

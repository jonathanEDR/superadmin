/**
 * Middleware para establecer la zona horaria de Perú en el servidor
 * Esto ayuda a asegurar que las fechas se manejen consistentemente
 */

const setPeruTimezone = (req, res, next) => {
  // Establecer zona horaria de Perú para el proceso
  process.env.TZ = 'America/Lima';
  
  // Agregar headers para indicar la zona horaria
  res.set('X-Timezone', 'America/Lima');
  res.set('X-UTC-Offset', '-05:00');
  
  next();
};

module.exports = { setPeruTimezone };

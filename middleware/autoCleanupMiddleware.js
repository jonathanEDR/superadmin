/**
 * Middleware de Auto-Limpieza para manejar errores de duplicado automáticamente
 */

const autoCleanupService = require('../services/autoCleanupService');

/**
 * Middleware que envuelve rutas y maneja errores de duplicado automáticamente
 */
const autoCleanupMiddleware = (handler) => {
  return async (req, res, next) => {
    try {
      // Ejecutar el handler original
      await handler(req, res, next);
    } catch (error) {
      // Si es error de clave duplicada, intentar auto-limpieza
      if (autoCleanupService.isDuplicateKeyError(error)) {
        console.log('[AutoCleanupMiddleware] 🚨 Error de duplicado detectado en ruta:', req.originalUrl);
        
        try {
          // Ejecutar auto-limpieza
          await autoCleanupService.handleDuplicateError(error);
          
          // Reintentar la operación original
          console.log('[AutoCleanupMiddleware] 🔄 Reintentando operación después de limpieza...');
          await handler(req, res, next);
          
        } catch (cleanupError) {
          console.error('[AutoCleanupMiddleware] ❌ Auto-limpieza falló:', cleanupError.message);
          
          // Enviar error específico sobre auto-limpieza
          res.status(500).json({
            message: 'Error de producto duplicado y la auto-limpieza falló',
            error: cleanupError.message,
            originalError: error.message,
            suggestion: 'Por favor, contacta al administrador del sistema'
          });
        }
      } else {
        // Si no es error de duplicado, pasar al siguiente middleware de error
        next(error);
      }
    }
  };
};

/**
 * Middleware específico para obtener estadísticas de auto-limpieza
 */
const getCleanupStats = (req, res) => {
  const stats = autoCleanupService.getStats();
  res.json({
    autoCleanup: stats,
    message: 'Estadísticas de auto-limpieza',
    timestamp: new Date().toISOString()
  });
};

/**
 * Middleware para ejecutar limpieza manual
 */
const manualCleanup = async (req, res) => {
  try {
    console.log('[ManualCleanup] 🧹 Ejecutando limpieza manual solicitada por:', req.user?.email || 'Usuario desconocido');
    
    const result = await autoCleanupService.fullCleanup();
    
    res.json({
      success: true,
      message: 'Limpieza manual completada exitosamente',
      result: {
        totalEliminated: result.totalEliminated,
        codesProcessed: result.codesProcessed
      },
      stats: autoCleanupService.getStats(),
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('[ManualCleanup] ❌ Error en limpieza manual:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error durante la limpieza manual',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * Middleware para verificar y limpiar si es necesario
 */
const checkAndClean = async (req, res) => {
  try {
    console.log('[CheckAndClean] 🔍 Verificando necesidad de limpieza...');
    
    const result = await autoCleanupService.checkAndCleanIfNeeded();
    
    res.json({
      success: true,
      message: result.totalEliminated > 0 
        ? 'Se encontraron y limpiaron duplicados'
        : 'No se encontraron duplicados',
      result: {
        totalEliminated: result.totalEliminated,
        codesProcessed: result.codesProcessed
      },
      stats: autoCleanupService.getStats(),
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('[CheckAndClean] ❌ Error en verificación:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error durante la verificación',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

module.exports = {
  autoCleanupMiddleware,
  getCleanupStats,
  manualCleanup,
  checkAndClean
};

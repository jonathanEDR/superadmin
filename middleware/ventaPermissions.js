const User = require('../models/User');
const Venta = require('../models/Venta');

/**
 * Verifica los permisos de asignación de ventas según el rol del usuario
 */
const validateVentaAssignment = async (req, res, next) => {
  try {
    const { targetUserId } = req.body;
    const creatorId = req.user.clerk_id;
    const creatorRole = req.user.role;

    // Si no hay targetUserId o es el mismo creador, continuar
    if (!targetUserId || targetUserId === creatorId) {
      return next();
    }

    // Buscar el usuario objetivo
    const targetUser = await User.findOne({ clerk_id: targetUserId });
    if (!targetUser) {
      return res.status(404).json({ message: 'Usuario objetivo no encontrado' });
    }

    // Validar permisos según rol
    switch (creatorRole) {
      case 'super_admin':
        // Super admin puede asignar a cualquiera
        break;
      case 'admin':
        // Admin solo puede asignar a users
        if (targetUser.role !== 'user') {
          return res.status(403).json({
            message: 'Los administradores solo pueden crear ventas para usuarios regulares',
            target_role: targetUser.role,
            your_role: creatorRole
          });
        }
        break;
      default:
        // Users no pueden asignar ventas a otros
        return res.status(403).json({
          message: 'No tienes permisos para crear ventas para otros usuarios',
          your_role: creatorRole
        });
    }

    next();
  } catch (error) {
    console.error('Error en validateVentaAssignment:', error);
    res.status(500).json({ message: 'Error al validar permisos de venta' });
  }
};

/**
 * Verifica los permisos para finalizar una venta
 */
const validateVentaCompletion = async (req, res, next) => {
  try {
    console.log('Iniciando validación de completion:', {
      params: req.params,
      body: req.body,
      user: {
        id: req.user.clerk_id,
        role: req.user.role
      }
    });

    const { id } = req.params;
    const { completionStatus } = req.body;
    const userRole = req.user.role;
    const userId = req.user.clerk_id;

    // Validar que existe un estado de finalización
    if (!completionStatus) {
      console.log('No se proporcionó estado de completion');
      return res.status(400).json({ 
        message: 'Se requiere un estado de finalización',
        received: req.body
      });
    }

    // Validar que el estado sea válido
    if (!['approved', 'rejected', 'pending'].includes(completionStatus)) {
      console.log('Estado de completion inválido:', completionStatus);
      return res.status(400).json({ 
        message: 'Estado de finalización inválido',
        received: completionStatus,
        allowed: ['approved', 'rejected', 'pending']
      });
    }

    // Buscar la venta
    const venta = await Venta.findById(id);
    if (!venta) {
      console.log('Venta no encontrada:', id);
      return res.status(404).json({ 
        message: 'Venta no encontrada',
        ventaId: id
      });
    }

    // Obtener información del creador
    const creator = await User.findOne({ clerk_id: venta.creatorId });
    if (!creator) {
      console.log('Creador no encontrado:', venta.creatorId);
    }
    const creatorRole = creator?.role || 'user';

    // Validar permisos según el flujo de aprobación
    if (completionStatus === 'pending') {
      // Solo el propietario puede marcar como pendiente
      if (venta.userId !== userId && venta.creatorId !== userId) {
        console.log('Usuario no autorizado para marcar como pendiente');
        return res.status(403).json({
          message: 'Solo puedes marcar como finalizadas tus propias ventas',
          ventaUserId: venta.userId,
          ventaCreatorId: venta.creatorId,
          requestUserId: userId
        });
      }
    } else if (['approved', 'rejected'].includes(completionStatus)) {
      // Validar permisos para aprobar/rechazar
      if (!['admin', 'super_admin'].includes(userRole)) {
        console.log('Usuario sin permisos para aprobar/rechazar:', userRole);
        return res.status(403).json({
          message: 'No tienes permisos para aprobar o rechazar ventas',
          yourRole: userRole
        });
      }

      // Admins no pueden aprobar/rechazar ventas de super_admin
      if (userRole === 'admin' && creatorRole === 'super_admin') {
        console.log('Admin intentando aprobar/rechazar venta de super_admin');
        return res.status(403).json({
          message: 'Los administradores no pueden aprobar/rechazar ventas creadas por Super Administradores',
          creatorRole,
          yourRole: userRole
        });
      }
    }

    // Añadir información útil al request
    req.ventaToUpdate = venta;
    req.creatorInfo = creator;

    console.log('Validación completada exitosamente');
    next();
  } catch (error) {
    console.error('Error en validateVentaCompletion:', error);
    res.status(500).json({ 
      message: 'Error al validar permisos de finalización de venta',
      error: error.message
    });
  }
};

module.exports = {
  validateVentaAssignment,
  validateVentaCompletion
};

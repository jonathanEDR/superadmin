const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { clerkClient } = require('@clerk/clerk-sdk-node');

// Middleware principal de autenticación
const authenticate = async (req, res, next) => {
  try {
    // Verificar el formato del header de autorización
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        message: 'Formato de autorización inválido',
        details: 'El header de autorización debe comenzar con "Bearer "' 
      });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ 
        message: 'Token no proporcionado',
        details: 'No se encontró un token en el header de autorización'
      });
    }

    // Verificar token con Clerk
    let session;
    try {
      session = await clerkClient.verifyToken(token);
      if (!session) {
        return res.status(401).json({ 
          message: 'Token inválido',
          details: 'El token proporcionado no pudo ser verificado'
        });
      }
    } catch (verifyError) {
      console.error('Error al verificar token:', verifyError);
      return res.status(401).json({ 
        message: 'Token inválido',
        details: 'Error al verificar el token'
      });
    }

    // Obtener información del usuario de Clerk
    let clerkUser;
    try {
      clerkUser = await clerkClient.users.getUser(session.sub);
      if (!clerkUser) {
        return res.status(401).json({ 
          message: 'Usuario no encontrado',
          details: 'No se encontró el usuario en Clerk'
        });
      }
    } catch (clerkError) {
      console.error('Error al obtener usuario de Clerk:', clerkError);
      return res.status(401).json({ 
        message: 'Error al obtener información del usuario',
        details: 'No se pudo obtener la información del usuario de Clerk'
      });
    }

    // Buscar o crear usuario en nuestra base de datos
    try {
      let user = await User.findOne({ clerk_id: session.sub });
      
      if (!user) {
        user = new User({
          clerk_id: session.sub,
          email: clerkUser.emailAddresses[0].emailAddress,
          nombre_negocio: clerkUser.firstName || 'Usuario',
          role: 'user',
          is_active: true
        });
        
        await user.save();
        console.log('Nuevo usuario creado:', user);
      }

      if (!user.is_active) {
        return res.status(401).json({ 
          message: 'Usuario desactivado',
          details: 'Tu cuenta está desactivada. Contacta al administrador.'
        });
      }

      // Agregar información del usuario a la request
      req.user = {
        _id: user._id,
        id: user._id,
        clerk_id: user.clerk_id,
        email: user.email,
        role: user.role,
        nombre_negocio: user.nombre_negocio,
        is_active: user.is_active
      };

      console.log('Usuario autenticado:', req.user);
      next();
    } catch (dbError) {
      console.error('Error en la base de datos:', dbError);
      return res.status(500).json({ 
        message: 'Error interno del servidor',
        details: 'Error al procesar la información del usuario en la base de datos'
      });
    }
  } catch (error) {
    console.error('Error general en autenticación:', error);
    return res.status(500).json({ 
      message: 'Error interno del servidor',
      details: 'Error general en el proceso de autenticación'
    });
  }
};

// Middleware para verificar roles específicos
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Usuario no autenticado' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        message: 'No tienes permisos para realizar esta acción',
        required_roles: roles,
        your_role: req.user.role
      });
    }

    next();
  };
};

// Middleware específicos por rol
const requireSuperAdmin = authorize('super_admin');
const requireAdmin = authorize('admin', 'super_admin');
const requireUser = authorize('user', 'admin', 'super_admin');

// Funciones de utilidad para verificar permisos
const hasPermission = (userRole, requiredRoles) => {
  return requiredRoles.includes(userRole);
};

const canModifyAllNotes = (userRole) => {
  return ['admin', 'super_admin'].includes(userRole);
};

const canModifyAllVentas = (userRole) => {
  return ['admin', 'super_admin'].includes(userRole);
};

const canDeleteNotes = (userRole) => {
  return ['admin', 'super_admin'].includes(userRole);
};

module.exports = {
  authenticate,
  authorize,
  requireSuperAdmin,
  requireAdmin,
  requireUser,
  hasPermission,
  canModifyAllNotes,
  canDeleteNotes,
  canModifyAllVentas
};
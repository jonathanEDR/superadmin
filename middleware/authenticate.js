const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { clerkClient } = require('@clerk/clerk-sdk-node');

// Middleware principal de autenticación
const authenticate = async (req, res, next) => {
  try {
    const token = req.headers['authorization']?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ message: 'Token no proporcionado' });
    }

    // Verificar token con Clerk
    const session = await clerkClient.verifyToken(token);
    
    if (!session) {
      return res.status(401).json({ message: 'Token inválido' });
    }

    // Obtener información del usuario de Clerk
    const clerkUser = await clerkClient.users.getUser(session.sub);
    
    if (!clerkUser) {
      return res.status(401).json({ message: 'Usuario no encontrado en Clerk' });
    }

    // Buscar usuario en la base de datos
    let user = await User.findOne({ clerk_id: session.sub });
    
    if (!user) {
      // Si el usuario no existe en nuestra base de datos, lo creamos
      user = new User({
        clerk_id: session.sub,
        email: clerkUser.emailAddresses[0].emailAddress,
        nombre_negocio: clerkUser.firstName || 'Usuario',
        role: 'user', // Rol por defecto
        is_active: true
      });
      
      try {
        await user.save();
        console.log('Nuevo usuario creado:', user);
      } catch (error) {
        console.error('Error al crear usuario:', error);
        return res.status(500).json({ message: 'Error al crear usuario en la base de datos' });
      }
    }

    if (!user.is_active) {
      return res.status(401).json({ message: 'Usuario desactivado' });
    }    // Add user object to request
    req.user = {
      _id: user._id,  // Importante: usar _id en lugar de id
      id: user._id,   // Mantener id por compatibilidad
      clerk_id: user.clerk_id,
      email: user.email,
      role: user.role,
      nombre_negocio: user.nombre_negocio,
      is_active: user.is_active
    };

    console.log('User authenticated:', req.user);
    next();
  } catch (error) {
    console.error('Error en autenticación:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
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

// Función de utilidad para verificar permisos
const hasPermission = (userRole, requiredRoles) => {
  return requiredRoles.includes(userRole);
};



// Función para verificar si puede modificar notas de otros usuarios
const canModifyAllNotes = (userRole) => {
  return ['admin', 'super_admin'].includes(userRole);
};

// Función para verificar si puede eliminar notas
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
  canDeleteNotes
};
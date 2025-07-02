const express = require('express');
const User = require('../models/User');
const Note = require('../models/Notas');
const Venta = require('../models/Venta');
const MovimientoCaja = require('../models/MovimientoCaja');
const Gasto = require('../models/Gasto');
const Producto = require('../models/Producto');
const { 
  authenticate, 
  requireSuperAdmin, 
  requireAdmin 
} = require('../middleware/authenticate');
const router = express.Router();

// ============= RUTAS SOLO PARA SUPER ADMIN =============

// Obtener todos los usuarios
router.get('/users', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', role = 'all' } = req.query;
    const skip = (page - 1) * limit;
    
    let filter = {};
    
    // Filtrar por rol si se especifica
    if (role && role !== 'all') {
      filter.role = role;
    }
    
    // Buscar por nombre o email
    if (search) {
      filter.$or = [
        { nombre_negocio: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    const [users, total] = await Promise.all([
      User.find(filter)
        .select('-password -__v')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      User.countDocuments(filter)
    ]);
      
    res.status(200).json({
      users,
      pagination: {
        current_page: parseInt(page),
        total_pages: Math.ceil(total / limit),
        total_users: total,
        per_page: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error obteniendo usuarios:', error);
    res.status(500).json({ message: 'Error al obtener usuarios', error: error.message });
  }
});

// Asignar rol a un usuario
router.put('/users/:userId/role', authenticate, requireSuperAdmin, async (req, res) => {
  const { userId } = req.params;
  const { role } = req.body;
  
  try {
    // Validar que el rol sea válido
    if (!['user', 'admin', 'super_admin', 'de_baja'].includes(role)) {
      return res.status(400).json({ 
        message: 'Rol inválido',
        valid_roles: ['user', 'admin', 'super_admin', 'de_baja']
      });
    }
      // No permitir que se cambie el rol del propio super admin
    if (req.user._id.toString() === userId) {
      return res.status(403).json({ 
        message: 'No puedes cambiar tu propio rol como super admin' 
      });
    }
    
    // No permitir cambiar el rol de otros super admin
    const userToUpdate = await User.findById(userId);
    if (!userToUpdate) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    
    if (userToUpdate.role === 'super_admin' && req.user._id.toString() !== userId) {
      return res.status(403).json({ 
        message: 'No puedes modificar el rol de otro super admin' 
      });
    }
    
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { role, updated_at: Date.now() },
      { new: true }
    ).select('-__v');
    
    if (!updatedUser) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    
    res.status(200).json({
      message: `Rol actualizado a ${role} exitosamente`,
      user: updatedUser
    });
  } catch (error) {
    console.error('Error actualizando rol:', error);
    res.status(500).json({ message: 'Error al actualizar rol', error: error.message });
  }
});

// Activar/Desactivar usuario
router.put('/users/:userId/status', authenticate, requireSuperAdmin, async (req, res) => {
  const { userId } = req.params;
  const { is_active } = req.body;
  
  try {
    if (typeof is_active !== 'boolean') {
      return res.status(400).json({ message: 'is_active debe ser true o false' });
    }
    
    // No permitir desactivar al propio super admin
    if (req.user._id.toString() === userId && !is_active) {
      return res.status(403).json({ 
        message: 'No puedes desactivar tu propia cuenta' 
      });
    }
    
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { is_active, updated_at: Date.now() },
      { new: true }
    ).select('-__v');
    
    if (!updatedUser) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    
    res.status(200).json({
      message: `Usuario ${is_active ? 'activado' : 'desactivado'} exitosamente`,
      user: updatedUser
    });
  } catch (error) {
    console.error('Error actualizando status:', error);
    res.status(500).json({ message: 'Error al actualizar status', error: error.message });
  }
});

// Eliminar usuario (Solo se elimina el usuario, los datos se conservan)
router.delete('/users/:userId', authenticate, requireSuperAdmin, async (req, res) => {
  const { userId } = req.params;
  
  try {
    console.log(`[ELIMINACION] Iniciando proceso de eliminación para userId: ${userId}`);
    
    // No permitir eliminar al propio super admin
    if (req.user._id.toString() === userId) {
      console.log(`[ELIMINACION] Intento de auto-eliminación bloqueado para: ${req.user.email}`);
      return res.status(403).json({ 
        message: 'No puedes eliminar tu propia cuenta' 
      });
    }
    
    const user = await User.findById(userId);
    if (!user) {
      console.log(`[ELIMINACION] Usuario no encontrado: ${userId}`);
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    
    // Verificar si es super admin (extra protección)
    if (user.role === 'super_admin') {
      console.log(`[ELIMINACION] Intento de eliminar super_admin bloqueado: ${user.email}`);
      return res.status(403).json({ 
        message: 'No se puede eliminar una cuenta de Super Admin' 
      });
    }
    
    const userClerkId = user.clerk_id;
    const userEmail = user.email;
    const userNegocio = user.nombre_negocio;
    
    console.log(`[ELIMINACION] Eliminando usuario: ${userEmail} (clerk_id: ${userClerkId})`);
    
    // Verificar datos existentes ANTES de eliminar el usuario
    const conteoAntes = {
      notas: await Note.countDocuments({ userId: userClerkId }),
      ventas: await Venta.countDocuments({ userId: userClerkId }),
      movimientos: await MovimientoCaja.countDocuments({ userId: userClerkId }),
      gastos: await Gasto.countDocuments({ userId: userClerkId }),
      productos: await Producto.countDocuments({ userId: userClerkId })
    };
    
    console.log(`[ELIMINACION] Datos ANTES de eliminar:`, conteoAntes);
    
    // SOLO eliminar el usuario de la colección User
    // IMPORTANTE: NO eliminamos nada más, solo el documento User
    await User.findByIdAndDelete(userId);
    
    console.log(`[ELIMINACION] Usuario eliminado de la colección User`);
    
    // Verificar que los datos se mantuvieron DESPUÉS de eliminar el usuario
    const conteoDespues = {
      notas: await Note.countDocuments({ userId: userClerkId }),
      ventas: await Venta.countDocuments({ userId: userClerkId }),
      movimientos: await MovimientoCaja.countDocuments({ userId: userClerkId }),
      gastos: await Gasto.countDocuments({ userId: userClerkId }),
      productos: await Producto.countDocuments({ userId: userClerkId })
    };
    
    console.log(`[ELIMINACION] Datos DESPUÉS de eliminar:`, conteoDespues);
    
    // Verificar que no se perdieron datos
    const datosConservados = 
      conteoAntes.notas === conteoDespues.notas &&
      conteoAntes.ventas === conteoDespues.ventas &&
      conteoAntes.movimientos === conteoDespues.movimientos &&
      conteoAntes.gastos === conteoDespues.gastos &&
      conteoAntes.productos === conteoDespues.productos;
    
    if (!datosConservados) {
      console.error(`[ERROR ELIMINACION] Se perdieron datos durante la eliminación!`);
      console.error(`Antes:`, conteoAntes);
      console.error(`Después:`, conteoDespues);
    } else {
      console.log(`[ELIMINACION] ✅ Todos los datos se conservaron correctamente`);
    }
    
    res.status(200).json({
      message: `Usuario ${userEmail} eliminado exitosamente. Todos sus datos han sido conservados completamente: ventas, notas, cobros, gastos, movimientos de caja, productos, devoluciones, gestión personal y pagos realizados permanecen intactos en el sistema para preservar la integridad del historial empresarial.`,
      deleted_user: {
        email: userEmail,
        nombre_negocio: userNegocio,
        clerk_id: userClerkId
      },
      datos_conservados: {
        antes: conteoAntes,
        despues: conteoDespues,
        verificacion_exitosa: datosConservados
      }
    });
  } catch (error) {
    console.error('Error eliminando usuario:', error);
    res.status(500).json({ message: 'Error al eliminar usuario', error: error.message });
  }
});

// Verificar datos asociados a un usuario (para depuración)
router.get('/users/:userId/associated-data', authenticate, requireSuperAdmin, async (req, res) => {
  const { userId } = req.params;
  
  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    
    const userClerkId = user.clerk_id;
    console.log(`[VERIFICACION] Verificando datos para usuario: ${user.email} (clerk_id: ${userClerkId})`);
    
    // Verificar todos los datos asociados
    const datosAsociados = {
      notas: await Note.countDocuments({ userId: userClerkId }),
      ventas: await Venta.countDocuments({ userId: userClerkId }),
      movimientos: await MovimientoCaja.countDocuments({ userId: userClerkId }),
      gastos: await Gasto.countDocuments({ userId: userClerkId }),
      productos: await Producto.countDocuments({ userId: userClerkId })
    };
    
    // También verificar datos donde el usuario es creador
    const datosComoCreador = {
      notasCreadas: await Note.countDocuments({ creatorId: userClerkId }),
      ventasCreadas: await Venta.countDocuments({ creatorId: userClerkId })
    };
    
    const totalRegistros = Object.values(datosAsociados).reduce((sum, count) => sum + count, 0) + 
                          Object.values(datosComoCreador).reduce((sum, count) => sum + count, 0);
    
    console.log(`[VERIFICACION] Datos encontrados:`, { datosAsociados, datosComoCreador, totalRegistros });
    
    res.status(200).json({
      usuario: {
        id: user._id,
        email: user.email,
        nombre_negocio: user.nombre_negocio,
        clerk_id: userClerkId,
        role: user.role
      },
      datos_como_propietario: datosAsociados,
      datos_como_creador: datosComoCreador,
      total_registros: totalRegistros
    });
  } catch (error) {
    console.error('Error verificando datos asociados:', error);
    res.status(500).json({ message: 'Error al verificar datos asociados', error: error.message });
  }
});

// ============= RUTAS PARA ADMIN Y SUPER ADMIN =============

// Obtener estadísticas del sistema
router.get('/dashboard/stats', authenticate, requireAdmin, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ is_active: true });
    const totalNotes = await Note.countDocuments();
    
    // Estadísticas por rol
    const usersByRole = await User.aggregate([
      { $group: { _id: '$role', count: { $sum: 1 } } }
    ]);
    
    // Notas por día (últimos 7 días)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const notesByDay = await Note.aggregate([
      { $match: { createdAt: { $gte: sevenDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    res.status(200).json({
      stats: {
        users: {
          total: totalUsers,
          active: activeUsers,
          inactive: totalUsers - activeUsers,
          by_role: usersByRole
        },
        notes: {
          total: totalNotes,
          by_day: notesByDay
        }
      }
    });
  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    res.status(500).json({ message: 'Error al obtener estadísticas', error: error.message });
  }
});

// La ruta /notes/all ya está definida más abajo

// Ruta para obtener usuarios (accesible para admin y super_admin)
router.get('/users-profiles', authenticate, async (req, res) => {
  try {
    // Verificar si el usuario es admin o super_admin
    if (!['admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({ 
        message: 'No tienes permisos para ver los perfiles de usuarios',
        your_role: req.user.role,
        required_roles: ['admin', 'super_admin']
      });
    }

    const { page = 1, limit = 10, search } = req.query;
    const skip = (page - 1) * limit;
    
    let filter = {};
    
    // Buscar por nombre o email
    if (search) {
      filter.$or = [
        { nombre_negocio: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }    const users = await User.find(filter)
      .select('-password -__v')
      .sort({ fecha_creacion: -1 })
      .skip(skip)
      .limit(parseInt(limit));
      
    const total = await User.countDocuments(filter);
    
    res.status(200).json({
      users,
      pagination: {
        current_page: parseInt(page),
        total_pages: Math.ceil(total / limit),
        total_users: total,
        per_page: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error obteniendo usuarios:', error);
    res.status(500).json({ message: 'Error al obtener usuarios', error: error.message });
  }
});

// Obtener todas las notas con información detallada
router.get('/notes/all', authenticate, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '' } = req.query;
    const skip = (page - 1) * limit;
    
    let filter = {};
    
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { content: { $regex: search, $options: 'i' } }
      ];
    }

    const [notes, total] = await Promise.all([
      Note.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Note.countDocuments(filter)
    ]);

    // Obtener todos los IDs de usuarios únicos
    const allUserIds = [...new Set([
      ...notes.map(note => note.userId),
      ...notes.map(note => note.creatorId)
    ])].filter(Boolean); // Eliminar valores null/undefined
    
    // Buscar información de todos los usuarios
    const users = await User.find({ 
      clerk_id: { $in: allUserIds } 
    }).select('clerk_id email nombre_negocio role');

    // Crear un mapa de usuarios por clerk_id para búsqueda rápida
    const userMap = users.reduce((acc, user) => {
      acc[user.clerk_id] = user;
      return acc;
    }, {});

    // Procesar las notas para incluir información del propietario y creador
    const processedNotes = notes.map(note => {
      const owner = userMap[note.userId];
      const creator = userMap[note.creatorId];
      
      return {
        ...note.toObject(),
        user_info: owner ? {
          nombre_negocio: owner.nombre_negocio || 'No especificado',
          email: owner.email,
          role: owner.role || 'user'
        } : {
          nombre_negocio: 'Usuario Eliminado',
          email: 'No disponible',
          role: 'unknown'
        },
        creator_info: creator ? {
          nombre_negocio: creator.nombre_negocio || 'No especificado',
          email: creator.email,
          role: creator.role || 'user',
          id: note.creatorId
        } : {
          nombre_negocio: 'Usuario Eliminado',
          email: 'No disponible',
          role: 'unknown',
          id: note.creatorId
        }
      };
    });

    // Debug log
    console.log('Notas procesadas:', processedNotes.map(n => ({
      title: n.title,
      creator: n.creator_info,
      owner: n.user_info
    })));

    res.json({
      notes: processedNotes,
      pagination: {
        current_page: parseInt(page),
        total_pages: Math.ceil(total / limit),
        total_notes: total,
        per_page: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error getting all notes:', error);
    res.status(500).json({ message: 'Error al obtener las notas' });
  }
});

// Obtener notas de los administradores para revisión por el super admin
router.get('/notes/admin-pending', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '' } = req.query;
    const skip = (page - 1) * limit;

    // Construir la consulta base para notas de administradores pendientes de revisión
    let matchQuery = {
      'creator.role': 'admin',
      isCompleted: true,
      completionStatus: 'pending'
    };

    // Agregar búsqueda por título o contenido si existe
    if (search) {
      matchQuery.$or = [
        { title: { $regex: search, $options: 'i' } },
        { content: { $regex: search, $options: 'i' } }
      ];
    }

    const pipeline = [
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: 'clerk_id',
          as: 'creator'
        }
      },
      { $unwind: '$creator' },
      { $match: matchQuery },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: parseInt(limit) },
      {
        $project: {
          _id: 1,
          title: 1,
          content: 1,
          isCompleted: 1,
          completionStatus: 1,
          createdAt: 1,
          updatedAt: 1,
          creator_info: {
            email: '$creator.email',
            role: '$creator.role'
          }
        }
      }
    ];

    const [notes, total] = await Promise.all([
      Note.aggregate(pipeline),
      Note.aggregate([
        { $lookup: { from: 'users', localField: 'userId', foreignField: 'clerk_id', as: 'creator' } },
        { $unwind: '$creator' },
        { $match: matchQuery },
        { $count: 'total' }
      ])
    ]);

    res.json({
      notes,
      pagination: {
        current_page: parseInt(page),
        total_pages: Math.ceil((total[0]?.total || 0) / limit),
        total_notes: total[0]?.total || 0,
        per_page: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error obteniendo notas pendientes de administradores:', error);
    res.status(500).json({ message: 'Error al obtener notas', error: error.message });
  }
});

// Endpoint de diagnóstico para verificar roles válidos (temporal)
router.get('/debug/valid-roles', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const validRoles = ['user', 'admin', 'super_admin', 'de_baja'];
    
    res.json({
      backend_version: '1.1.0',
      valid_roles: validRoles,
      timestamp: new Date().toISOString(),
      message: 'Backend funcionando correctamente con soporte para de_baja'
    });
  } catch (error) {
    console.error('Error en endpoint de diagnóstico:', error);
    res.status(500).json({ 
      message: 'Error en diagnóstico',
      error: error.message 
    });
  }
});

// Promover usuario a admin (solo para super_admin)
router.post('/promote/:userId', authenticate, requireSuperAdmin, async (req, res) => {
  const { userId } = req.params;
  
  try {
    console.log(`[PROMOCION] Iniciando promoción de usuario: ${userId}`);
    
    // Buscar el usuario a promover
    const userToPromote = await User.findById(userId);
    if (!userToPromote) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    // Verificar que el usuario actual no se esté promoviendo a sí mismo
    if (req.user._id.toString() === userId) {
      return res.status(403).json({ 
        message: 'No puedes promover tu propia cuenta' 
      });
    }

    // Verificar que el usuario no sea ya admin o super_admin
    if (userToPromote.role === 'admin') {
      return res.status(400).json({ 
        message: 'El usuario ya es administrador' 
      });
    }

    if (userToPromote.role === 'super_admin') {
      return res.status(400).json({ 
        message: 'El usuario ya es super administrador' 
      });
    }

    // Solo permitir promoción de usuarios con rol 'user' a 'admin'
    if (userToPromote.role !== 'user') {
      return res.status(400).json({ 
        message: 'Solo se pueden promover usuarios con rol "user"' 
      });
    }

    // Actualizar el rol a admin
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { 
        role: 'admin', 
        updated_at: Date.now() 
      },
      { new: true }
    ).select('-__v');

    console.log(`[PROMOCION] Usuario promovido exitosamente: ${updatedUser.email} -> admin`);

    res.status(200).json({
      message: 'Usuario promovido a administrador exitosamente',
      user: updatedUser
    });
  } catch (error) {
    console.error('Error promoviendo usuario:', error);
    res.status(500).json({ message: 'Error al promover usuario', error: error.message });
  }
});

// Degradar usuario de admin a user (solo para super_admin)
router.post('/demote/:userId', authenticate, requireSuperAdmin, async (req, res) => {
  const { userId } = req.params;
  
  try {
    console.log(`[DEGRADACION] Iniciando degradación de usuario: ${userId}`);
    
    // Buscar el usuario a degradar
    const userToDemote = await User.findById(userId);
    if (!userToDemote) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    // Verificar que el usuario actual no se esté degradando a sí mismo
    if (req.user._id.toString() === userId) {
      return res.status(403).json({ 
        message: 'No puedes degradar tu propia cuenta' 
      });
    }

    // Solo permitir degradación de usuarios con rol 'admin' a 'user'
    if (userToDemote.role !== 'admin') {
      return res.status(400).json({ 
        message: 'Solo se pueden degradar usuarios con rol "admin"' 
      });
    }

    // Actualizar el rol a user
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { 
        role: 'user', 
        updated_at: Date.now() 
      },
      { new: true }
    ).select('-__v');

    console.log(`[DEGRADACION] Usuario degradado exitosamente: ${updatedUser.email} -> user`);

    res.status(200).json({
      message: 'Usuario degradado a usuario normal exitosamente',
      user: updatedUser
    });
  } catch (error) {
    console.error('Error degradando usuario:', error);
    res.status(500).json({ message: 'Error al degradar usuario', error: error.message });
  }
});

// Promover usuario a super_admin (solo para super_admin, uso muy cuidadoso)
router.post('/promote-super/:userId', authenticate, requireSuperAdmin, async (req, res) => {
  const { userId } = req.params;
  const { confirmation } = req.body;
  
  try {
    console.log(`[PROMOCION SUPER] Iniciando promoción a super_admin: ${userId}`);
    
    // Verificar confirmación explícita
    if (confirmation !== 'PROMOTE_TO_SUPER_ADMIN') {
      return res.status(400).json({ 
        message: 'Se requiere confirmación explícita para promover a super_admin',
        required_confirmation: 'PROMOTE_TO_SUPER_ADMIN'
      });
    }

    // Buscar el usuario a promover
    const userToPromote = await User.findById(userId);
    if (!userToPromote) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    // Verificar que el usuario actual no se esté promoviendo a sí mismo
    if (req.user._id.toString() === userId) {
      return res.status(403).json({ 
        message: 'No puedes promover tu propia cuenta' 
      });
    }

    // Verificar que el usuario no sea ya super_admin
    if (userToPromote.role === 'super_admin') {
      return res.status(400).json({ 
        message: 'El usuario ya es super administrador' 
      });
    }

    // Solo permitir promoción de usuarios con rol 'admin' a 'super_admin'
    if (userToPromote.role !== 'admin') {
      return res.status(400).json({ 
        message: 'Solo se pueden promover usuarios con rol "admin" a super_admin' 
      });
    }

    // Actualizar el rol a super_admin
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { 
        role: 'super_admin', 
        updated_at: Date.now() 
      },
      { new: true }
    ).select('-__v');

    console.log(`[PROMOCION SUPER] Usuario promovido exitosamente: ${updatedUser.email} -> super_admin`);

    res.status(200).json({
      message: 'Usuario promovido a super administrador exitosamente',
      user: updatedUser,
      warning: 'Este usuario ahora tiene permisos completos del sistema'
    });
  } catch (error) {
    console.error('Error promoviendo a super_admin:', error);
    res.status(500).json({ message: 'Error al promover usuario', error: error.message });
  }
});

module.exports = router;
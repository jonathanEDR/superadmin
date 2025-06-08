const express = require('express');
const Note = require('../models/Notas');
const User = require('../models/User');
const { 
  authenticate, 
  requireUser,
  canModifyAllNotes,
  canDeleteNotes 
} = require('../middleware/authenticate');
const router = express.Router();

// Función helper para procesar notas con información del creador
async function processNotesWithCreatorInfo(notes) {
  if (!Array.isArray(notes)) {
    console.warn('processNotesWithCreatorInfo received non-array:', notes);
    return [];
  }

  // Obtener todos los IDs únicos de usuarios (creadores, propietarios y revisores)
  const userIds = [...new Set(notes.reduce((acc, note) => {
    if (note?.creatorId) acc.push(note.creatorId);
    if (note?.userId) acc.push(note.userId);
    if (note?.adminReviewedBy) acc.push(note.adminReviewedBy);
    return acc;
  }, []))];

  if (userIds.length === 0) {
    console.warn('No valid user IDs found in notes');
    return notes;
  }

  // Buscar información de todos los usuarios
  const users = await User.find({ 
    clerk_id: { $in: userIds } 
  }).select('clerk_id email nombre_negocio role');

  // Crear un mapa de usuarios por clerk_id para búsqueda rápida
  const userMap = users.reduce((acc, user) => {
    if (user && user.clerk_id) {
      acc[user.clerk_id] = user;
    }
    return acc;
  }, {});

  // Procesar las notas para incluir información completa
  return notes.map(note => {
    if (!note) return null;
    
    const creator = note.creatorId ? userMap[note.creatorId] : null;
    const owner = note.userId ? userMap[note.userId] : null;
    const reviewer = note.adminReviewedBy ? userMap[note.adminReviewedBy] : null;
    
    return {
      ...note.toObject ? note.toObject() : note,
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
      },
      user_info: owner ? {
        nombre_negocio: owner.nombre_negocio || 'No especificado',
        email: owner.email,
        role: owner.role || 'user',
        id: note.userId
      } : {
        nombre_negocio: 'Usuario Eliminado',
        email: 'No disponible',
        role: 'unknown',
        id: note.userId
      },
      reviewedByInfo: reviewer ? {
        nombre_negocio: reviewer.nombre_negocio || 'No especificado',
        email: reviewer.email,
        role: reviewer.role || 'user',
        id: note.adminReviewedBy
      } : null
    };
  }).filter(Boolean); // Remove any null values
}

// Crear una nueva nota (Todos los usuarios autenticados)
router.post('/create', authenticate, requireUser, async (req, res) => {
  const { title, content, fechadenota, targetUserId } = req.body;
  const creatorId = req.user.clerk_id;
  let userId = creatorId;
  
  try {    if (!title || !content) {
      return res.status(400).json({ message: 'Título y contenido son requeridos' });
    }

    // Validar que el usuario tenga permisos si intenta crear una nota para otro usuario
    if (targetUserId && targetUserId !== creatorId) {
      if (!['admin', 'super_admin'].includes(req.user.role)) {
        return res.status(403).json({ 
          message: 'No tienes permisos para crear notas para otros usuarios',
          required_role: ['admin', 'super_admin'],
          your_role: req.user.role
        });
      }

      // Verificar que el usuario objetivo existe
      const targetUser = await User.findOne({ clerk_id: targetUserId });
      if (!targetUser) {
        return res.status(404).json({ message: 'Usuario objetivo no encontrado' });
      }
    }

    // Si es admin o super_admin y proporciona un targetUserId, usar ese ID
    if (['admin', 'super_admin'].includes(req.user.role) && targetUserId) {
      userId = targetUserId;
    }    const newNote = new Note({
      userId,
      creatorId,
      title,
      content,
      fechadenota: fechadenota ? new Date(fechadenota) : new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await newNote.save();

    // Obtener información del usuario y creador
    const [targetUserInfo, creatorInfo] = await Promise.all([
      User.findOne({ clerk_id: userId }).select('email nombre_negocio role'),
      User.findOne({ clerk_id: creatorId }).select('email nombre_negocio role')
    ]);

    // Preparar la respuesta con toda la información necesaria
    const noteResponse = {
      ...newNote.toObject(),
      user_info: targetUserInfo ? {
        email: targetUserInfo.email,
        nombre_negocio: targetUserInfo.nombre_negocio,
        role: targetUserInfo.role
      } : null,
      creator_info: creatorInfo ? {
        email: creatorInfo.email,
        nombre_negocio: creatorInfo.nombre_negocio,
        role: creatorInfo.role
      } : null
    };

    res.status(201).json({ 
      message: 'Nota creada exitosamente',
      note: noteResponse
    });

    // Obtener información del creador y propietario
    const [creator, owner] = await Promise.all([
      User.findOne({ clerk_id: creatorId }).select('clerk_id email nombre_negocio role'),
      User.findOne({ clerk_id: userId }).select('clerk_id email nombre_negocio role')
    ]);

    // Agregar información de usuario a la respuesta
    const noteWithUserInfo = {
      ...newNote.toObject(),
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
        id: creatorId
      } : {
        nombre_negocio: 'Usuario Eliminado',
        email: 'No disponible',
        role: 'unknown',
        id: creatorId
      }
    };

    res.status(201).json({ 
      message: 'Nota creada exitosamente', 
      note: noteWithUserInfo
    });
  } catch (error) {
    console.error('Error creando nota:', error);
    res.status(500).json({ message: 'Error al crear la nota', error: error.message });
  }
});

// Obtener notas (filtradas por rol)
router.get('/', authenticate, requireUser, async (req, res) => {  const userId = req.user.clerk_id;
  const userRole = req.user.role;
    try {
    let notes;    // Super Admin y Admin pueden ver todas las notas
    if (canModifyAllNotes(userRole)) {
      console.log('Obteniendo notas para rol:', userRole);
      const limit = 10;
      const skip = (parseInt(req.query.page) - 1) * limit || 0;
      
      const [notesData, total] = await Promise.all([
        Note.find({})
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit),
        Note.countDocuments({})
      ]);
      
      // Obtener información de usuarios para cada nota
      const notesWithUserInfo = await Promise.all(
        notesData.map(async (note) => {
          const [userInfo, creatorInfo] = await Promise.all([
            User.findOne({ clerk_id: note.userId }).select('email nombre_negocio role'),
            User.findOne({ clerk_id: note.creatorId }).select('email nombre_negocio role')
          ]);

          return {
            ...note.toObject(),
            user_info: userInfo ? {
              email: userInfo.email,
              nombre_negocio: userInfo.nombre_negocio,
              role: userInfo.role
            } : null,
            creator_info: creatorInfo ? {
              email: creatorInfo.email,
              nombre_negocio: creatorInfo.nombre_negocio,
              role: creatorInfo.role
            } : null
          };
        })
      );
      
      const processedNotes = await processNotesWithCreatorInfo(notes);
        console.log('Enviando notas procesadas:', notesWithUserInfo.map(n => ({
        id: n._id,
        role: n.creator_info?.role,
        isCompleted: n.isCompleted,
        status: n.completionStatus
      })));

      return res.status(200).json({ 
        message: 'Todas las notas obtenidas',
        notes: notesWithUserInfo,
        pagination: {
          total_pages: Math.ceil(total / limit),
          current_page: parseInt(req.query.page) || 1,
          total_items: total,
          items_per_page: limit
        },
        role: userRole
      });
    }

    // Usuarios normales solo ven sus propias notas
    notes = await Note.find({ userId }).sort({ createdAt: -1 });
    notes = await processNotesWithCreatorInfo(notes);
    res.status(200).json({ 
      message: 'Tus notas obtenidas',
      notes,
      total: notes.length,
      role: userRole
    });
  } catch (error) {
    console.error('Error obteniendo notas:', error);
    res.status(500).json({ message: 'Error al obtener las notas', error: error.message });
  }
});

// Obtener notas aprobadas
router.get('/approved', authenticate, requireUser, async (req, res) => {
  const userId = req.user.clerk_id;
  const userRole = req.user.role;
  const { search = '', date = '' } = req.query;
  
  try {
    console.log('Fetching approved notes for user:', userId, 'with role:', userRole);
    
    let query = { 
      isCompleted: true, 
      completionStatus: 'approved'
    };

    // Agregar filtros de búsqueda si existen
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { content: { $regex: search, $options: 'i' } }
      ];
    }

    // Agregar filtro de fecha si existe
    if (date) {
      const startDate = new Date(date);
      const endDate = new Date(date);
      endDate.setDate(endDate.getDate() + 1);
      query.adminReviewedAt = {
        $gte: startDate,
        $lt: endDate
      };
    }

    // Si no es admin/super_admin, solo ver sus propias notas
    if (!canModifyAllNotes(userRole)) {
      query.userId = userId;
    }

    console.log('Final query:', query);

    const notes = await Note.find(query)
      .sort({ completedAt: -1 });

    console.log('Found notes:', notes.length);

    // Procesar notas con toda la información
    const processedNotes = await processNotesWithCreatorInfo(notes);

    console.log('Processed notes:', processedNotes.length);

    res.json({ 
      success: true,
      notes: processedNotes,
      total: processedNotes.length
    });
  } catch (error) {
    console.error('Error obteniendo notas aprobadas:', error);
    res.status(500).json({ message: 'Error al obtener el historial de notas' });
  }
});

// Obtener una nota específica
router.get('/:noteId', authenticate, requireUser, async (req, res) => {  const { noteId } = req.params;
  const userId = req.user.clerk_id;
  const userRole = req.user.role;
  
  try {
    let note;
    
    // Admin y Super Admin pueden ver cualquier nota
    if (canModifyAllNotes(userRole)) {
      note = await Note.findById(noteId);
    } else {
      // Usuarios normales solo pueden ver sus propias notas
      note = await Note.findOne({ _id: noteId, userId });
    }
    
    if (!note) {
      return res.status(404).json({ message: 'Nota no encontrada o sin permisos' });
    }
    
    res.status(200).json({ note });
  } catch (error) {
    console.error('Error obteniendo nota:', error);
    res.status(500).json({ message: 'Error al obtener la nota', error: error.message });
  }
});

// Actualizar una nota
router.put('/update/:noteId', authenticate, requireUser, async (req, res) => {
  const { noteId } = req.params;
  const { title, content } = req.body;
  const userId = req.user.clerk_id;
  const userRole = req.user.role;
  
  try {
    if (!title || !content) {
      return res.status(400).json({ message: 'Título y contenido son requeridos' });
    }

    let updatedNote;
    
    // Admin y Super Admin pueden editar cualquier nota
    if (canModifyAllNotes(userRole)) {
      updatedNote = await Note.findOneAndUpdate(
        { _id: noteId }, 
        { title, content, updatedAt: Date.now() },
        { new: true }
      );
    } else {
      // Usuarios normales solo pueden editar sus propias notas
      updatedNote = await Note.findOneAndUpdate(
        { _id: noteId, userId }, 
        { title, content, updatedAt: Date.now() },
        { new: true }
      );
    }
    
    if (!updatedNote) {
      return res.status(404).json({ message: 'Nota no encontrada o sin permisos para editar' });
    }
    
    res.status(200).json({ 
      message: 'Nota actualizada exitosamente', 
      note: updatedNote 
    });
  } catch (error) {
    console.error('Error actualizando nota:', error);
    res.status(500).json({ message: 'Error al actualizar la nota', error: error.message });
  }
});

// Eliminar una nota
router.delete('/delete/:noteId', authenticate, requireUser, async (req, res) => {
  try {
    const note = await Note.findById(req.params.noteId);
    if (!note) {
      return res.status(404).json({ message: 'Nota no encontrada' });
    }

    // Obtener información del usuario propietario de la nota
    const noteOwner = await User.findOne({ clerk_id: note.userId });
      // Si el usuario que intenta eliminar es admin, verificar tanto el propietario como el creador
    if (req.user.role === 'admin') {
      // Obtener información del creador de la nota
      const noteCreator = await User.findOne({ clerk_id: note.creatorId });
      
      if (noteOwner?.role === 'super_admin' || noteCreator?.role === 'super_admin') {
        return res.status(403).json({
          message: 'Los administradores no pueden eliminar notas creadas o pertenecientes a super administradores'
        });
      }
    }

    // Verificar permisos
    if (note.userId !== req.user.clerk_id && !['admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({
        message: 'No tienes permisos para eliminar esta nota'
      });
    }

    await Note.findByIdAndDelete(req.params.noteId);
    res.status(200).json({ message: 'Nota eliminada exitosamente' });
  } catch (error) {
    console.error('Error al eliminar nota:', error);
    res.status(500).json({ message: 'Error al eliminar la nota' });
  }
});

// Ruta para obtener estadísticas (Solo Admin y Super Admin)
router.get('/stats/overview', authenticate, async (req, res) => {
  const userRole = req.user.role;
  
  try {
    if (!canModifyAllNotes(userRole)) {
      return res.status(403).json({ message: 'No tienes permisos para ver estadísticas' });
    }

    const totalNotes = await Note.countDocuments();
    const notesToday = await Note.countDocuments({
      createdAt: {
        $gte: new Date(new Date().setHours(0, 0, 0, 0))
      }
    });

    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ is_active: true });

    res.status(200).json({
      stats: {
        totalNotes,
        notesToday,
        totalUsers,
        activeUsers
      }
    });
  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    res.status(500).json({ message: 'Error al obtener estadísticas', error: error.message });
  }
});

// Obtener lista de usuarios para admins
router.get('/users-list', authenticate, async (req, res) => {
  try {
    console.log('=== Users List Request ===');
    console.log('User in request:', req.user);
    console.log('Headers:', req.headers);
    
    if (!req.user || !req.user.role) {
      console.log('Auth error: No user or role');
      return res.status(401).json({ 
        message: 'Usuario no autenticado correctamente',
        debug: { user: req.user }
      });
    }

    if (!['admin', 'super_admin'].includes(req.user.role)) {
      console.log('Permission error: Invalid role:', req.user.role);
      return res.status(403).json({ 
        message: 'No tienes permisos para ver la lista de usuarios',
        debug: { role: req.user.role, requiredRoles: ['admin', 'super_admin'] }
      });
    }    console.log('Fetching users...');
    
    // Obtener todos los usuarios activos, excluyendo al usuario actual
    const users = await User.find({ 
      is_active: true,
      clerk_id: { $ne: req.user.clerk_id } // Excluir al usuario actual
    }).select('clerk_id email nombre_negocio role');

    console.log('Found users:', users);    // Filtrar solo usuarios normales
    const normalUsers = users.filter(user => user.role === 'user');
    console.log('Filtered normal users:', normalUsers);

    // Si no hay usuarios, devolver array vacío
    if (!normalUsers || normalUsers.length === 0) {
      console.log('No normal users found');
      return res.status(200).json({
        success: true,
        users: [],
        message: 'No se encontraron usuarios disponibles'
      });
    }    // Mapear los usuarios a un formato más simple
    const userList = normalUsers.map(user => ({
      id: user.clerk_id,
      name: user.nombre_negocio || 'Usuario',
      email: user.email
    }));

    console.log('Final user list to send:', userList);

    res.status(200).json({
      success: true,
      users: userList    });
  } catch (error) {
    console.error('Error obteniendo usuarios:', error);
    // Log additional error details
    console.error('Error stack:', error.stack);
    console.error('MongoDB error:', error.message);
    
    res.status(500).json({ 
      success: false, 
      message: 'Error al obtener la lista de usuarios',
      error: error.message 
    });
  }
});

// Obtener todas las notas (solo admin y super_admin)
router.get('/all', authenticate, canModifyAllNotes, async (req, res) => {
  try {
    const notes = await Note.find()
      .sort({ createdAt: -1 })
      .populate({
        path: 'userId',
        select: 'nombre_negocio email clerk_id'
      });

    // Formatear las notas para incluir información del propietario
    const formattedNotes = notes.map(note => ({
      _id: note._id,
      title: note.title,
      content: note.content,
      fechadenota: note.fechadenota,
      created_at: note.createdAt,
      updated_at: note.updatedAt,
      owner_name: note.userId?.nombre_negocio || 'Usuario desconocido',
      owner_email: note.userId?.email,
      user_id: note.userId?.clerk_id
    }));

    res.json(formattedNotes);
  } catch (error) {
    console.error('Error al obtener todas las notas:', error);
    res.status(500).json({ message: 'Error al obtener las notas', error: error.message });
  }
});

// Marcar una nota como completada
router.patch('/:noteId/complete', authenticate, requireUser, async (req, res) => {
  const { noteId } = req.params;
  const userId = req.user.clerk_id;
  
  try {
    let note;
    if (canModifyAllNotes(req.user.role)) {
      note = await Note.findById(noteId);
    } else {
      note = await Note.findOne({ _id: noteId, userId });
    }

    if (!note) {
      return res.status(404).json({ message: 'Nota no encontrada o sin permisos' });
    }

    note.isCompleted = true;
    note.completionStatus = 'pending';
    note.completedAt = new Date();
    await note.save();

    res.json({ message: 'Nota marcada como completada', note });
  } catch (error) {
    console.error('Error al marcar nota como completada:', error);
    res.status(500).json({ message: 'Error al actualizar la nota' });
  }
});

// Revisar una nota completada (solo admin y super_admin)
router.patch('/:noteId/review', authenticate, requireUser, async (req, res) => {
  const { noteId } = req.params;
  const { status } = req.body;
  const adminId = req.user.clerk_id;

  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ message: 'Estado de revisión inválido' });
  }
  // Verificar si el usuario es admin o super_admin
  if (!['admin', 'super_admin'].includes(req.user.role)) {
    return res.status(403).json({ message: 'No tienes permisos para revisar notas' });
  }

  try {    const note = await Note.findById(noteId);
    
    if (!note) {
      return res.status(404).json({ message: 'Nota no encontrada' });
    }

    // Obtener información inicial del creador para validación
    const creatorInfo = await User.findOne({ clerk_id: note.creatorId });

    // Si el usuario es admin y el creador es super_admin, no permitir la revisión
    if (req.user.role === 'admin' && creatorInfo?.role === 'super_admin') {
      return res.status(403).json({ 
        message: 'Los administradores no pueden revisar notas creadas por Super Administradores'
      });
    }

    if (!note.isCompleted) {
      return res.status(400).json({ message: 'La nota no está marcada como completada' });
    }
    
    note.completionStatus = status;
    note.adminReviewedBy = adminId;
    note.adminReviewedAt = new Date();
    await note.save();

    // Obtener información completa de todos los usuarios relacionados
    const [owner, reviewer, creator] = await Promise.all([
      User.findOne({ clerk_id: note.userId }).select('email nombre_negocio role'),
      User.findOne({ clerk_id: adminId }).select('email nombre_negocio role'),
      User.findOne({ clerk_id: note.creatorId }).select('email nombre_negocio role')
    ]);

    const noteResponse = {
      ...note.toObject(),
      user_info: owner ? {
        email: owner.email,
        nombre_negocio: owner.nombre_negocio,
        role: owner.role
      } : null,
      creator_info: creator ? {
        email: creator.email,
        nombre_negocio: creator.nombre_negocio,
        role: creator.role
      } : null,
      reviewedByInfo: reviewer ? {
        email: reviewer.email,
        nombre_negocio: reviewer.nombre_negocio,
        role: reviewer.role
      } : null
    };

    res.json({ 
      message: `Nota ${status === 'approved' ? 'aprobada' : 'rechazada'}`, 
      note: noteResponse 
    });
  } catch (error) {
    console.error('Error al revisar nota:', error);
    res.status(500).json({ message: 'Error al actualizar el estado de la nota' });
  }
});

// Obtener notas aprobadas
router.get('/approved', authenticate, requireUser, async (req, res) => {
  const userId = req.user.clerk_id;
  const userRole = req.user.role;
  const { search = '', date = '' } = req.query;
  
  try {
    console.log('Fetching approved notes for user:', userId, 'with role:', userRole);
    
    let query = { 
      isCompleted: true, 
      completionStatus: 'approved'
    };

    // Agregar filtros de búsqueda si existen
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { content: { $regex: search, $options: 'i' } }
      ];
    }

    // Agregar filtro de fecha si existe
    if (date) {
      const startDate = new Date(date);
      const endDate = new Date(date);
      endDate.setDate(endDate.getDate() + 1);
      query.adminReviewedAt = {
        $gte: startDate,
        $lt: endDate
      };
    }

    // Si no es admin/super_admin, solo ver sus propias notas
    if (!canModifyAllNotes(userRole)) {
      query.userId = userId;
    }

    console.log('Final query:', query);

    const notes = await Note.find(query)
      .sort({ completedAt: -1 });

    console.log('Found notes:', notes.length);

    // Procesar notas con toda la información
    const processedNotes = await processNotesWithCreatorInfo(notes);

    console.log('Processed notes:', processedNotes.length);

    res.json({ 
      success: true,
      notes: processedNotes,
      total: processedNotes.length
    });
  } catch (error) {
    console.error('Error obteniendo notas aprobadas:', error);
    res.status(500).json({ message: 'Error al obtener el historial de notas' });
  }
});

module.exports = router;
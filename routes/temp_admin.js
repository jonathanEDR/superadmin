const express = require('express');
const User = require('../models/User');
const Note = require('../models/Notas');
const { 
  authenticate, 
  requireSuperAdmin, 
  requireAdmin 
} = require('../middleware/authenticate');
const router = express.Router();

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

module.exports = router;

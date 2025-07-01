const express = require('express');
const router = express.Router();
const { authenticate, requireUser } = require('../middleware/authenticate');
const notasService = require('../services/notasService');

// Crear una nueva nota (Todos los usuarios autenticados)
router.post('/create', authenticate, requireUser, async (req, res) => {
  const { title, content, fechadenota, targetUserId } = req.body;
  const creatorId = req.user.clerk_id;
  let userId = creatorId;
  if (targetUserId && ['admin', 'super_admin'].includes(req.user.role)) {
    userId = targetUserId;
  }
  try {
    if (!title || !content) {
      return res.status(400).json({ message: 'Título y contenido son requeridos' });
    }
    const newNote = await notasService.createNote({ title, content, fechadenota, creatorId, userId });
    const processed = await notasService.processNotesWithUserInfo([newNote]);
    res.status(201).json({ message: 'Nota creada exitosamente', note: processed[0] });
  } catch (error) {
    console.error('Error creando nota:', error);
    res.status(500).json({ message: 'Error al crear la nota', error: error.message });
  }
});

// Obtener notas (filtradas por rol)
router.get('/', authenticate, requireUser, async (req, res) => {
  const userId = req.user.clerk_id;
  const userRole = req.user.role;
  try {
    const notes = await notasService.getNotesByRole({ userId, userRole });
    res.status(200).json({ message: 'Notas obtenidas', notes, total: notes.length, role: userRole });
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
    const notes = await notasService.getApprovedNotes({ userId, userRole, search, date });
    res.json({ success: true, notes, total: notes.length });
  } catch (error) {
    console.error('Error obteniendo notas aprobadas:', error);
    res.status(500).json({ message: 'Error al obtener el historial de notas' });
  }
});

// Obtener usuarios gestionados por el admin (para crear notas a otros usuarios)
router.get('/my-users', authenticate, requireUser, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Solo los administradores pueden acceder a esta lista' });
  }
  try {
    const users = await require('../services/notasService').getUsersForAdmin({ adminId: req.user.clerk_id });
    res.status(200).json({ users });
  } catch (error) {
    console.error('Error obteniendo usuarios para admin:', error);
    res.status(500).json({ message: 'Error al obtener usuarios', error: error.message });
  }
});

// Obtener una nota específica
router.get('/:noteId', authenticate, requireUser, async (req, res) => {
  const { noteId } = req.params;
  const userId = req.user.clerk_id;
  const userRole = req.user.role;
  try {
    let notes;
    if (['admin', 'super_admin'].includes(userRole)) {
      notes = await notasService.processNotesWithUserInfo(await require('../models/Notas').find({ _id: noteId }));
    } else {
      notes = await notasService.processNotesWithUserInfo(await require('../models/Notas').find({ _id: noteId, userId }));
    }
    if (!notes.length) {
      return res.status(404).json({ message: 'Nota no encontrada' });
    }
    res.status(200).json({ note: notes[0] });
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
    const updatedNote = await notasService.updateNote({ noteId, title, content, userId, userRole });
    if (!updatedNote) {
      return res.status(404).json({ message: 'Nota no encontrada o sin permisos' });
    }
    const processed = await notasService.processNotesWithUserInfo([updatedNote]);
    res.status(200).json({ message: 'Nota actualizada exitosamente', note: processed[0] });
  } catch (error) {
    console.error('Error actualizando nota:', error);
    res.status(500).json({ message: 'Error al actualizar la nota', error: error.message });
  }
});

// Eliminar una nota
router.delete('/delete/:noteId', authenticate, requireUser, async (req, res) => {
  const { noteId } = req.params;
  const userId = req.user.clerk_id;
  const userRole = req.user.role;
  try {
    const deleted = await notasService.deleteNote({ noteId, userId, userRole });
    if (!deleted) {
      return res.status(404).json({ message: 'Nota no encontrada o sin permisos' });
    }
    res.status(200).json({ message: 'Nota eliminada exitosamente' });
  } catch (error) {
    console.error('Error al eliminar nota:', error);
    res.status(500).json({ message: 'Error al eliminar la nota' });
  }
});

// Marcar una nota como completada (solo el propietario de la nota)
router.patch('/:noteId/complete', authenticate, requireUser, async (req, res) => {
  const { noteId } = req.params;
  const userId = req.user.clerk_id;
  
  try {
    const note = await notasService.completeNote({ noteId, userId });
    
    if (!note) {
      return res.status(404).json({ message: 'Nota no encontrada o no tienes permisos para completarla' });
    }
    
    const processed = await notasService.processNotesWithUserInfo([note]);
    res.status(200).json({ 
      message: 'Nota marcada como completada. Pendiente de revisión del administrador', 
      note: processed[0] 
    });
  } catch (error) {
    console.error('Error completando nota:', error);
    if (error.message === 'La nota ya está completada') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error al completar la nota', error: error.message });
  }
});

// Revisar una nota completada (solo admin y super_admin)
router.patch('/:noteId/review', authenticate, requireUser, async (req, res) => {
  const { noteId } = req.params;
  const { status } = req.body;
  const adminId = req.user.clerk_id;
  const userRole = req.user.role;
  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ message: 'Estado inválido' });
  }
  if (!['admin', 'super_admin'].includes(userRole)) {
    return res.status(403).json({ message: 'No tienes permisos para revisar notas' });
  }
  try {
    const note = await require('../models/Notas').findById(noteId);
    if (!note) {
      return res.status(404).json({ message: 'Nota no encontrada' });
    }
    note.completionStatus = status;
    note.isCompleted = true;
    note.completedAt = new Date();
    note.adminReviewedBy = adminId;
    note.adminReviewedAt = new Date();
    await note.save();
    const processed = await notasService.processNotesWithUserInfo([note]);
    res.status(200).json({ message: `Nota ${status === 'approved' ? 'aprobada' : 'rechazada'} exitosamente`, note: processed[0] });
  } catch (error) {
    console.error('Error revisando nota:', error);
    res.status(500).json({ message: 'Error al revisar la nota', error: error.message });
  }
});

module.exports = router;
// backend/services/notasService.js
const Note = require('../models/Notas');
const User = require('../models/User');

// Procesa notas para incluir info de usuario y creador
async function processNotesWithUserInfo(notes) {
  if (!Array.isArray(notes)) return [];
  const userIds = [...new Set(notes.reduce((acc, note) => {
    if (note?.creatorId) acc.push(note.creatorId);
    if (note?.userId) acc.push(note.userId);
    if (note?.adminReviewedBy) acc.push(note.adminReviewedBy);
    return acc;
  }, []))];
  const users = await User.find({ clerk_id: { $in: userIds } }).select('clerk_id email nombre_negocio role');
  const userMap = users.reduce((acc, user) => {
    acc[user.clerk_id] = user;
    return acc;
  }, {});
  return notes.map(note => {
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
  }).filter(Boolean);
}

// Crear una nota
async function createNote({ title, content, fechadenota, creatorId, userId }) {
  const newNote = new Note({
    userId,
    creatorId,
    title,
    content,
    fechadenota: fechadenota ? new Date(fechadenota) : new Date(),
    createdAt: new Date(),
    updatedAt: new Date()
  });
  await newNote.save();
  return newNote;
}

// Obtener notas según rol
async function getNotesByRole({ userId, userRole }) {
  let notes;
  if (['admin', 'super_admin'].includes(userRole)) {
    notes = await Note.find().sort({ createdAt: -1 });
  } else {
    notes = await Note.find({ userId }).sort({ createdAt: -1 });
  }
  return processNotesWithUserInfo(notes);
}

// Obtener notas aprobadas según rol
async function getApprovedNotes({ userId, userRole, search, date }) {
  let query = { isCompleted: true, completionStatus: 'approved' };
  if (search) query.title = { $regex: search, $options: 'i' };
  if (date) query.fechadenota = { $gte: new Date(date) };
  if (!['admin', 'super_admin'].includes(userRole)) {
    query.userId = userId;
  }
  const notes = await Note.find(query).sort({ completedAt: -1 });
  return processNotesWithUserInfo(notes);
}

// Actualizar una nota
async function updateNote({ noteId, title, content, userId, userRole }) {
  let note;
  if (['admin', 'super_admin'].includes(userRole)) {
    note = await Note.findByIdAndUpdate(noteId, { title, content, updatedAt: new Date() }, { new: true });
  } else {
    note = await Note.findOneAndUpdate({ _id: noteId, userId }, { title, content, updatedAt: new Date() }, { new: true });
  }
  return note;
}

// Eliminar una nota
async function deleteNote({ noteId, userId, userRole }) {
  let note;
  if (['admin', 'super_admin'].includes(userRole)) {
    note = await Note.findByIdAndDelete(noteId);
  } else {
    note = await Note.findOneAndDelete({ _id: noteId, userId });
  }
  return note;
}

// Marcar una nota como completada por el usuario
async function completeNote({ noteId, userId }) {
  const note = await Note.findOne({ _id: noteId, userId });
  
  if (!note) {
    return null;
  }
  
  if (note.isCompleted) {
    throw new Error('La nota ya está completada');
  }
  
  note.isCompleted = true;
  note.completedAt = new Date();
  note.completionStatus = 'pending';
  await note.save();
  
  return note;
}

// Obtener usuarios gestionados por el admin (para crear notas a otros usuarios)
async function getUsersForAdmin({ adminId }) {
  // Aquí puedes personalizar la lógica según tu modelo de negocio.
  // Ejemplo: si los usuarios tienen un campo 'admin' que indica su admin responsable:
  // return await User.find({ admin: adminId }).select('clerk_id email nombre_negocio role');

  // Si no tienes esa relación, puedes devolver todos los usuarios que no sean admin/super_admin:
  return await User.find({ role: { $nin: ['admin', 'super_admin'] } }).select('clerk_id email nombre_negocio role');
}

module.exports = {
  processNotesWithUserInfo,
  createNote,
  getNotesByRole,
  getApprovedNotes,
  updateNote,
  deleteNote,
  completeNote,
  getUsersForAdmin // <-- exportar la nueva función
};

const mongoose = require('mongoose');

// Esquema de la Nota

const noteSchema = new mongoose.Schema({
  userId: {
    type: String,  // Cambiar de ObjectId a String
    required: true,
  },  
  creatorId: {
    type: String,  // Cambiado a String para usar Clerk IDs
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  fechadenota: {
    type: Date,
    default: Date.now,
  },
  isCompleted: {
    type: Boolean,
    default: false
  },
  completionStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  completedAt: {
    type: Date
  },
  adminReviewedBy: {
    type: String  // Clerk ID del admin que revisó
  },
  adminReviewedAt: {
    type: Date
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  }
});

const Note = mongoose.model('Note', noteSchema);

module.exports = Note;

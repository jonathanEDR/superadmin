const mongoose = require('mongoose');

// Define el esquema del contador
const counterSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 }
});

// Crear el modelo del contador si no existe
const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

// Función para obtener el siguiente valor de la secuencia
const getNextSequenceValue = async function(sequenceName) {
    const counter = await Counter.findByIdAndUpdate(
        sequenceName,
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
    );
    return counter.seq;
};

module.exports = {
    Counter,
    getNextSequenceValue
};

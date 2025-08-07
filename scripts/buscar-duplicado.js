require('dotenv').config();
const mongoose = require('mongoose');
const MovimientoCajaFinanzas = require('../models/finanzas/MovimientoCaja');

async function buscarCodigoDuplicado() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('🔌 Conectado a MongoDB');
        
        // Buscar el código específico que está fallando
        const codigo = 'EGR202508070001';
        console.log(`🔍 Buscando movimientos con código: ${codigo}`);
        
        const movimientos = await MovimientoCajaFinanzas.find({ codigo });
        console.log(`📊 Total encontrados: ${movimientos.length}`);
        
        movimientos.forEach((mov, index) => {
            console.log(`${index + 1}. ID: ${mov._id}`);
            console.log(`   - Código: ${mov.codigo}`);
            console.log(`   - Concepto: ${mov.concepto}`);
            console.log(`   - UserId: ${mov.userId}`);
            console.log(`   - Tipo: ${mov.tipo}`);
            console.log(`   - Monto: ${mov.monto}`);
            console.log(`   - Fecha Creación: ${mov.createdAt}`);
            console.log('');
        });
        
        // Buscar todos los códigos que empiecen con EGR20250807
        console.log('🔍 Buscando todos los códigos de hoy...');
        const codigos = await MovimientoCajaFinanzas.find({ 
            codigo: { $regex: '^EGR20250807' }
        }).sort({ codigo: 1 });
        
        console.log(`📊 Códigos de hoy encontrados: ${codigos.length}`);
        codigos.forEach((mov, index) => {
            console.log(`${index + 1}. ${mov.codigo} - ${mov.concepto} - ${mov.userId}`);
        });
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Desconectado de MongoDB');
    }
}

buscarCodigoDuplicado();

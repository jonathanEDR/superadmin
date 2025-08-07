require('dotenv').config();
const mongoose = require('mongoose');
const MovimientoCajaFinanzas = require('../models/finanzas/MovimientoCaja');

async function testCodigoUnico() {
    try {
        console.log('🧪 ========== PROBANDO GENERACIÓN DE CÓDIGOS ÚNICOS ==========');
        
        // Conectar a MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('🔌 Conectado a MongoDB');
        
        const userData = {
            userId: 'user_2y9iVVpx0nHTHChMyZSXb3ONARl',
            creatorId: '687e53e3af76045e61985d4f',
            creatorName: 'jonathan',
            creatorEmail: 'edjonathan5@gmail.com',
            creatorRole: 'super_admin'
        };
        
        // 1. Ver todos los códigos existentes para hoy
        const fecha = new Date();
        const año = fecha.getFullYear();
        const mes = (fecha.getMonth() + 1).toString().padStart(2, '0');
        const dia = fecha.getDate().toString().padStart(2, '0');
        const fechaCodigo = `${año}${mes}${dia}`;
        
        console.log('📅 Fecha para códigos:', fechaCodigo);
        
        const existentes = await MovimientoCajaFinanzas.find({ 
            codigo: { $regex: `^EGR${fechaCodigo}` },
            userId: userData.userId
        }).sort({ codigo: 1 });
        
        console.log('📊 Códigos existentes para hoy:');
        existentes.forEach(mov => {
            console.log(`   - ${mov.codigo} (${mov.concepto})`);
        });
        
        // 2. Intentar crear un nuevo movimiento
        console.log('\n🔨 Creando nuevo movimiento...');
        
        const nuevoMovimiento = new MovimientoCajaFinanzas({
            tipo: 'egreso',
            monto: 1,
            concepto: 'Prueba Código Único',
            descripcion: 'Prueba de generación de código único',
            categoria: 'gasto_operativo',
            metodoPago: {
                tipo: 'efectivo',
                detalles: {
                    billetes: { b10: 0, b20: 0, b50: 0, b100: 0, b200: 0 },
                    monedas: { m1: 1, m2: 0, m5: 0, c10: 0, c20: 0, c50: 0 }
                }
            },
            ...userData
        });
        
        const resultado = await nuevoMovimiento.save();
        console.log('✅ Movimiento creado exitosamente:');
        console.log(`   - Código: ${resultado.codigo}`);
        console.log(`   - ID: ${resultado._id}`);
        
        // 3. Verificar que el código es único
        const duplicados = await MovimientoCajaFinanzas.find({ 
            codigo: resultado.codigo 
        });
        
        if (duplicados.length === 1) {
            console.log('✅ Código es único en la base de datos');
        } else {
            console.log(`❌ Se encontraron ${duplicados.length} movimientos con el mismo código`);
            duplicados.forEach((dup, index) => {
                console.log(`   ${index + 1}. ${dup._id} - ${dup.concepto}`);
            });
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.code === 11000) {
            console.log('💡 Error de código duplicado detectado');
            
            // Buscar códigos duplicados
            const pipeline = [
                { $group: { _id: "$codigo", count: { $sum: 1 }, docs: { $push: "$$ROOT" } } },
                { $match: { count: { $gt: 1 } } }
            ];
            
            const duplicados = await MovimientoCajaFinanzas.aggregate(pipeline);
            console.log('📊 Códigos duplicados encontrados:', duplicados.length);
            
            for (const dup of duplicados) {
                console.log(`\n🔁 Código duplicado: ${dup._id} (${dup.count} veces)`);
                dup.docs.forEach((doc, index) => {
                    console.log(`   ${index + 1}. ${doc._id} - ${doc.concepto} - ${doc.createdAt}`);
                });
            }
        }
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Desconectado de MongoDB');
        console.log('🏁 Test de código único finalizado');
    }
}

testCodigoUnico();

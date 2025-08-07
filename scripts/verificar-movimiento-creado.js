/**
 * Script para verificar si el movimiento se está creando correctamente en la base de datos
 */

require('dotenv').config();
const mongoose = require('mongoose');
const MovimientoCajaFinanzas = require('../models/finanzas/MovimientoCaja');
const MovimientoBancario = require('../models/finanzas/MovimientoBancario');

async function verificarMovimiento() {
    try {
        console.log('🔍 ========== VERIFICACIÓN DE MOVIMIENTO ==========');
        
        // Conectar a la base de datos
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('🔌 Conectado a MongoDB');
        
        // Buscar el último movimiento creado (según los logs: EGR202508071325)
        const codigoBuscado = 'EGR202508071325';
        console.log('🔍 Buscando movimiento con código:', codigoBuscado);
        
        const movimientoCaja = await MovimientoCajaFinanzas.findOne({ codigo: codigoBuscado });
        
        if (movimientoCaja) {
            console.log('✅ Movimiento de caja ENCONTRADO:');
            console.log('   📋 Código:', movimientoCaja.codigo);
            console.log('   💰 Monto:', movimientoCaja.monto);
            console.log('   📅 Fecha:', movimientoCaja.fecha);
            console.log('   👤 UserId:', movimientoCaja.userId);
            console.log('   🏦 Afecta cuenta bancaria:', movimientoCaja.afectaCuentaBancaria);
            console.log('   🔗 Cuenta bancaria ID:', movimientoCaja.cuentaBancariaId);
            console.log('   📊 Estado:', movimientoCaja.estado);
            console.log('   📝 Concepto:', movimientoCaja.concepto);
            
            // Verificar el movimiento bancario asociado
            if (movimientoCaja.movimientoBancarioId) {
                console.log('\n🏦 Verificando movimiento bancario asociado...');
                const movimientoBancario = await MovimientoBancario.findById(movimientoCaja.movimientoBancarioId);
                if (movimientoBancario) {
                    console.log('✅ Movimiento bancario ENCONTRADO:');
                    console.log('   📋 Código:', movimientoBancario.codigo);
                    console.log('   💰 Monto:', movimientoBancario.monto);
                    console.log('   📅 Fecha:', movimientoBancario.fechaMovimiento);
                    console.log('   🏦 Cuenta:', movimientoBancario.cuentaBancariaId);
                    console.log('   📊 Estado:', movimientoBancario.estado);
                } else {
                    console.log('❌ Movimiento bancario NO ENCONTRADO');
                }
            } else {
                console.log('⚠️ No hay movimiento bancario asociado');
            }
            
        } else {
            console.log('❌ Movimiento de caja NO ENCONTRADO');
            
            // Buscar movimientos recientes
            console.log('\n🔍 Buscando últimos 5 movimientos...');
            const ultimosMovimientos = await MovimientoCajaFinanzas.find()
                .sort({ createdAt: -1 })
                .limit(5)
                .select('codigo tipo monto fecha userId concepto estado createdAt');
                
            console.log('📋 Últimos movimientos encontrados:');
            ultimosMovimientos.forEach((mov, index) => {
                console.log(`   ${index + 1}. ${mov.codigo} - ${mov.tipo} - $${mov.monto} - ${mov.concepto} - ${mov.fecha} - Estado: ${mov.estado}`);
            });
        }
        
        // Buscar movimientos bancarios recientes
        console.log('\n🏦 Verificando últimos movimientos bancarios...');
        const ultimosMovimientosBancarios = await MovimientoBancario.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .select('codigo tipo monto fechaMovimiento cuentaBancariaId estado descripcion createdAt');
            
        console.log('📋 Últimos movimientos bancarios:');
        ultimosMovimientosBancarios.forEach((mov, index) => {
            console.log(`   ${index + 1}. ${mov.codigo} - ${mov.tipo} - $${mov.monto} - ${mov.descripcion} - Estado: ${mov.estado}`);
        });
        
        console.log('\n🧪 ========== VERIFICACIÓN COMPLETADA ==========');
        
    } catch (error) {
        console.error('❌ Error en la verificación:', error);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Desconectado de MongoDB');
    }
}

// Ejecutar la verificación
if (require.main === module) {
    verificarMovimiento().then(() => {
        console.log('🏁 Verificación finalizada');
        process.exit(0);
    }).catch(error => {
        console.error('💥 Error fatal:', error);
        process.exit(1);
    });
}

module.exports = { verificarMovimiento };

/**
 * Script para probar que los movimientos ahora aparecen correctamente en la consulta
 */

require('dotenv').config();
const mongoose = require('mongoose');
const MovimientosCajaFinanzasService = require('../services/Finanzas/movimientosCajaFinanzasService');

async function probarConsultaMovimientos() {
    try {
        console.log('🧪 ========== PRUEBA DE CONSULTA DE MOVIMIENTOS ==========');
        
        // Conectar a la base de datos
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('🔌 Conectado a MongoDB');
        
        // Usar el clerk_id correcto (que es el que se está usando para guardar)
        const clerkId = 'user_2y9iVVpx0nHTHChMyZSXb3ONARl';
        console.log('👤 Consultando movimientos para clerk_id:', clerkId);
        
        // Obtener movimientos usando el servicio (como lo hace la ruta actualizada)
        const filtros = {};
        const movimientos = await MovimientosCajaFinanzasService.obtenerMovimientos(clerkId, filtros);
        
        console.log('📊 Resultados de la consulta:');
        console.log('   📈 Total de movimientos:', movimientos.movimientos.length);
        console.log('   📋 Paginación:', movimientos.paginacion);
        
        if (movimientos.movimientos.length > 0) {
            console.log('\n✅ PRIMEROS 5 MOVIMIENTOS ENCONTRADOS:');
            movimientos.movimientos.slice(0, 5).forEach((mov, index) => {
                console.log(`   ${index + 1}. ${mov.codigo} - ${mov.tipo} - $${mov.monto} - ${mov.concepto} - ${mov.fecha.toISOString().split('T')[0]}`);
            });
            
            // Buscar específicamente el movimiento que creamos
            const movimientoBuscado = movimientos.movimientos.find(mov => mov.codigo === 'EGR202508071325');
            if (movimientoBuscado) {
                console.log('\n🎯 MOVIMIENTO ESPECÍFICO ENCONTRADO:');
                console.log('   📋 Código:', movimientoBuscado.codigo);
                console.log('   💰 Monto:', movimientoBuscado.monto);
                console.log('   📝 Concepto:', movimientoBuscado.concepto);
                console.log('   📅 Fecha:', movimientoBuscado.fecha);
                console.log('   🏦 Afecta cuenta bancaria:', movimientoBuscado.afectaCuentaBancaria);
                console.log('   🆔 UserId:', movimientoBuscado.userId);
                console.log('   ✅ EL MOVIMIENTO AHORA APARECE EN LA CONSULTA!');
            } else {
                console.log('\n❌ El movimiento EGR202508071325 NO fue encontrado en la consulta');
            }
        } else {
            console.log('❌ No se encontraron movimientos');
        }
        
        // También probar el resumen del día
        console.log('\n📊 ========== PRUEBA DE RESUMEN DEL DÍA ==========');
        const hoy = new Date();
        const resumen = await MovimientosCajaFinanzasService.obtenerResumenDia(clerkId, hoy);
        
        console.log('📊 Resumen del día:');
        console.log('   📈 Ingresos:', resumen.resumenGeneral.ingresos);
        console.log('   📉 Egresos:', resumen.resumenGeneral.egresos);
        console.log('   💵 Saldo neto:', resumen.resumenGeneral.saldoNeto);
        console.log('   💰 Efectivo:', resumen.efectivo);
        
        console.log('\n🧪 ========== PRUEBAS COMPLETADAS ==========');
        
    } catch (error) {
        console.error('❌ Error en las pruebas:', error);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Desconectado de MongoDB');
    }
}

// Ejecutar las pruebas
if (require.main === module) {
    probarConsultaMovimientos().then(() => {
        console.log('🏁 Pruebas finalizadas');
        process.exit(0);
    }).catch(error => {
        console.error('💥 Error fatal:', error);
        process.exit(1);
    });
}

module.exports = { probarConsultaMovimientos };

/**
 * Script para probar exactamente el flujo que usa el frontend
 * Simula un egreso bancario desde el frontend
 */

require('dotenv').config();
const mongoose = require('mongoose');
const MovimientosCajaFinanzasService = require('../services/Finanzas/movimientosCajaFinanzasService');
const CuentaBancaria = require('../models/finanzas/CuentaBancaria');

async function testFlujoFrontend() {
    try {
        console.log('🧪 ========== SIMULANDO FLUJO DEL FRONTEND ==========');
        
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('🔌 Conectado a MongoDB');
        
        // 1. Simular el usuario autenticado como llega del frontend
        const usuarioFrontend = {
            _id: '687e53e3af76045e61985d4f', // MongoDB ID
            clerk_id: 'user_2y9iVVpx0nHTHChMyZSXb3ONARl', // Clerk ID
            email: 'edjonathan5@gmail.com',
            role: 'super_admin',
            nombre_negocio: 'jonathan'
        };
        
        console.log('👤 Usuario del frontend:', usuarioFrontend);
        
        // 2. Obtener cuenta bancaria como lo hace el frontend
        console.log('\n🔍 Obteniendo cuentas bancarias disponibles...');
        const cuentasDisponibles = await MovimientosCajaFinanzasService.obtenerCuentasDisponibles(
            usuarioFrontend._id, 
            usuarioFrontend
        );
        
        console.log('📋 Cuentas disponibles desde el servicio:', cuentasDisponibles.length);
        
        if (cuentasDisponibles.length === 0) {
            console.log('❌ No hay cuentas disponibles - problema de identificación de usuario');
            
            // Verificar manualmente con clerk_id
            console.log('\n🔍 Verificando con clerk_id directamente...');
            const cuentasClerkId = await CuentaBancaria.find({ 
                userId: usuarioFrontend.clerk_id,
                activa: true 
            });
            console.log('📋 Cuentas encontradas con clerk_id:', cuentasClerkId.length);
            
            return;
        }
        
        const cuentaPrueba = cuentasDisponibles[0];
        console.log('🏦 Cuenta seleccionada:', {
            _id: cuentaPrueba._id,
            nombre: cuentaPrueba.nombre,
            saldoActual: cuentaPrueba.saldo
        });
        
        // 3. Obtener saldo inicial de la cuenta
        const cuentaCompleta = await CuentaBancaria.findById(cuentaPrueba._id);
        const saldoInicial = cuentaCompleta.saldoActual;
        console.log('💰 Saldo inicial de la cuenta:', saldoInicial);
        
        // 4. Simular datos como los envía el frontend
        // 🔧 CORRECCIÓN: Usar clerk_id para userData.userId
        const userData = {
            userId: usuarioFrontend.clerk_id, // 🔧 Usar clerk_id en lugar de _id
            creatorId: usuarioFrontend._id,
            creatorName: usuarioFrontend.nombre_negocio || 'Usuario',
            creatorEmail: usuarioFrontend.email,
            creatorRole: usuarioFrontend.role
        };
        
        console.log('📝 UserData que se enviará:', userData);
        
        // 5. Datos del egreso como los envía el frontend
        const datosEgreso = {
            monto: 5.00,
            concepto: 'Prueba Frontend',
            descripcion: 'Simulación del flujo del frontend',
            categoria: 'gasto_operativo',
            tipoMovimiento: 'bancario',
            cuentaBancariaId: cuentaPrueba._id, // ID de la cuenta seleccionada
            metodoPago: {
                tipo: 'transferencia',
                detalles: {
                    numeroOperacion: 'FRONTEND-' + Date.now(),
                    banco: cuentaPrueba.banco
                }
            },
            afectaCuentaBancaria: true,
            observaciones: 'Prueba desde script de frontend'
        };
        
        console.log('\n💸 Registrando egreso como lo haría el frontend...');
        console.log('📊 Datos del egreso:', {
            monto: datosEgreso.monto,
            cuentaBancariaId: datosEgreso.cuentaBancariaId,
            afectaCuentaBancaria: datosEgreso.afectaCuentaBancaria
        });
        
        // 6. Intentar registrar el egreso
        try {
            const resultado = await MovimientosCajaFinanzasService.registrarEgreso(datosEgreso, userData);
            console.log('✅ Egreso registrado exitosamente:', resultado.codigo);
            
            // 7. Verificar si el saldo cambió
            const cuentaDespues = await CuentaBancaria.findById(cuentaPrueba._id);
            const saldoFinal = cuentaDespues.saldoActual;
            const diferencia = saldoInicial - saldoFinal;
            
            console.log('\n📊 RESULTADOS:');
            console.log('   Saldo inicial:', saldoInicial);
            console.log('   Saldo final:', saldoFinal);
            console.log('   Diferencia:', diferencia);
            console.log('   Monto del egreso:', datosEgreso.monto);
            
            if (Math.abs(diferencia - datosEgreso.monto) < 0.01) {
                console.log('✅ ÉXITO: El saldo se actualizó correctamente');
            } else {
                console.log('❌ PROBLEMA: El saldo NO se actualizó correctamente');
                console.log('   Se esperaba una reducción de:', datosEgreso.monto);
                console.log('   Se obtuvo una reducción de:', diferencia);
            }
            
        } catch (error) {
            console.log('❌ Error al registrar egreso:', error.message);
            
            // Analizar el tipo de error
            if (error.message.includes('Saldo insuficiente')) {
                console.log('💡 El error es por saldo insuficiente - la validación funciona');
            } else if (error.message.includes('duplicate key')) {
                console.log('💡 El error es por código duplicado - problema de generación de códigos');
            } else {
                console.log('💡 Error desconocido - revisar integración');
            }
        }
        
    } catch (error) {
        console.error('❌ Error en la simulación:', error);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Desconectado de MongoDB');
    }
}

// Ejecutar la simulación
if (require.main === module) {
    testFlujoFrontend().then(() => {
        console.log('🏁 Simulación del frontend finalizada');
        process.exit(0);
    }).catch(error => {
        console.error('💥 Error fatal:', error);
        process.exit(1);
    });
}

module.exports = { testFlujoFrontend };

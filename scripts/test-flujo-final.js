require('dotenv').config();
const mongoose = require('mongoose');
const MovimientosCajaFinanzasService = require('../services/Finanzas/movimientosCajaFinanzasService');
const CuentaBancaria = require('../models/finanzas/CuentaBancaria');

async function testFlujoFinalFrontend() {
    try {
        console.log('🎉 ========== PRUEBA FINAL DEL FLUJO FRONTEND ==========');
        
        // Conectar a MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('🔌 Conectado a MongoDB');
        
        // 1. Simular el usuario como viene del middleware de autenticación
        const req = {
            user: {
                id: 'user_2y9iVVpx0nHTHChMyZSXb3ONARl', // clerk_id desde el frontend
                _id: '687e53e3af76045e61985d4f', // MongoDB _id del usuario
                email: 'edjonathan5@gmail.com',
                role: 'super_admin',
                nombre_negocio: 'jonathan'
            }
        };
        
        console.log('👤 Usuario autenticado simulado:', req.user);
        
        // 2. Construir userData exactamente como lo hace la ruta actualizada
        const userData = {
            userId: req.user.id, // 🔧 Usar clerk_id para compatibilidad con cuentas bancarias  
            creatorId: req.user._id || req.user.id,
            creatorName: req.user.nombre_negocio || req.user.firstName || 'Usuario',
            creatorEmail: req.user.email,
            creatorRole: req.user.role || 'user'
        };
        
        console.log('📋 UserData construido por la ruta:', userData);
        
        // 3. Obtener cuenta de prueba
        const cuentaPrueba = await CuentaBancaria.findOne({
            userId: userData.userId
        });
        
        if (!cuentaPrueba) {
            throw new Error('No se encontró cuenta bancaria para el usuario');
        }
        
        console.log('🏦 Cuenta de prueba encontrada:', {
            _id: cuentaPrueba._id,
            nombre: cuentaPrueba.nombre,
            saldoActual: cuentaPrueba.saldoActual
        });
        
        const saldoInicial = cuentaPrueba.saldoActual;
        
        // 4. Preparar datos del egreso como los envía el frontend
        const datosEgreso = {
            tipo: 'egreso',
            monto: 3,
            concepto: 'Prueba Final Frontend',
            descripcion: 'Prueba final con nueva configuración',
            categoria: 'gasto_operativo',
            tipoMovimiento: 'bancario',
            cuentaBancariaId: cuentaPrueba._id.toString(),
            metodoPago: {
                tipo: 'transferencia',
                detalles: {
                    numeroOperacion: `FINAL-${Date.now()}`,
                    banco: cuentaPrueba.banco
                }
            },
            afectaCuentaBancaria: true,
            observaciones: 'Prueba final con corrección de clerk_id'
        };
        
        console.log('💸 Datos del egreso:', datosEgreso);
        
        // 5. Ejecutar el servicio exactamente como lo hace la ruta
        console.log('\n🔄 Ejecutando registrarEgreso...');
        const resultado = await MovimientosCajaFinanzasService.registrarEgreso(datosEgreso, userData);
        
        console.log('✅ Egreso registrado exitosamente:', resultado.codigo);
        
        // 6. Verificar el saldo actualizado
        const cuentaActualizada = await CuentaBancaria.findById(cuentaPrueba._id);
        const saldoFinal = cuentaActualizada.saldoActual;
        
        console.log('\n📊 RESULTADOS FINALES:');
        console.log(`   Saldo inicial: ${saldoInicial}`);
        console.log(`   Saldo final: ${saldoFinal}`);
        console.log(`   Diferencia: ${saldoInicial - saldoFinal}`);
        console.log(`   Monto del egreso: ${datosEgreso.monto}`);
        
        if (Math.abs((saldoInicial - saldoFinal) - datosEgreso.monto) < 0.01) {
            console.log('✅ 🎉 ÉXITO TOTAL: El saldo se actualizó correctamente');
            console.log('✅ 🚀 El frontend ahora debería funcionar perfectamente');
        } else {
            console.log('❌ Error: El saldo no se actualizó correctamente');
        }
        
    } catch (error) {
        console.error('❌ Error en la prueba final:', error.message);
        if (error.code === 11000) {
            console.log('💡 Error de código duplicado - esto es normal en pruebas repetidas');
        }
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Desconectado de MongoDB');
        console.log('🏁 Prueba final completada');
    }
}

testFlujoFinalFrontend();

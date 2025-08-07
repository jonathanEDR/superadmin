/**
 * Script de prueba para verificar la integración bancaria
 * Verifica que los egresos/ingresos afecten correctamente el saldo de cuentas bancarias
 */

require('dotenv').config();
const mongoose = require('mongoose');
const MovimientosCajaFinanzasService = require('../services/Finanzas/movimientosCajaFinanzasService');
const CuentaBancaria = require('../models/finanzas/CuentaBancaria');
const MovimientoCajaFinanzas = require('../models/finanzas/MovimientoCaja');

async function testIntegracionBancaria() {
    try {
        console.log('🧪 ========== INICIANDO PRUEBAS DE INTEGRACIÓN BANCARIA ==========');
        
        // Conectar a la base de datos
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('🔌 Conectado a MongoDB');
        
        // 1. Obtener una cuenta bancaria de prueba
        const cuentasPrueba = await CuentaBancaria.find({ activa: true }).limit(1);
        
        if (cuentasPrueba.length === 0) {
            console.log('❌ No hay cuentas bancarias disponibles para la prueba');
            return;
        }
        
        const cuentaPrueba = cuentasPrueba[0];
        console.log('🏦 Cuenta de prueba seleccionada:', {
            codigo: cuentaPrueba.codigo,
            nombre: cuentaPrueba.nombre,
            saldoInicial: cuentaPrueba.saldoActual,
            banco: cuentaPrueba.banco
        });
        
        const saldoInicialPrueba = cuentaPrueba.saldoActual;
        
        // 2. Simular datos de usuario
        const userData = {
            userId: cuentaPrueba.userId,
            creatorId: 'test-user',
            creatorName: 'Usuario Test',
            creatorEmail: 'test@example.com',
            creatorRole: 'admin'
        };
        
        console.log('\n🔍 ========== PRUEBA 1: EGRESO BANCARIO ==========');
        
        // 3. Registrar un egreso bancario
        const montoEgreso = Math.min(15.00, saldoInicialPrueba * 0.5); // Usar la mitad del saldo o 15, lo que sea menor
        console.log('💡 Monto de egreso ajustado a:', montoEgreso, '(saldo disponible:', saldoInicialPrueba, ')');
        const datosEgreso = {
            monto: montoEgreso,
            concepto: 'Prueba de egreso bancario',
            descripcion: 'Script de prueba para verificar integración',
            categoria: 'gasto_operativo',
            metodoPago: {
                tipo: 'transferencia',
                detalles: {
                    numeroOperacion: 'TEST-' + Date.now(),
                    cuentaOrigen: cuentaPrueba.numeroCuenta,
                    banco: cuentaPrueba.banco
                }
            },
            // Campos para integración bancaria
            afectaCuentaBancaria: true,
            cuentaBancariaId: cuentaPrueba._id.toString(),
            observaciones: 'Prueba de integración bancaria - Egreso'
        };
        
        console.log('💸 Registrando egreso bancario por $', montoEgreso);
        const egresoRegistrado = await MovimientosCajaFinanzasService.registrarEgreso(datosEgreso, userData);
        console.log('✅ Egreso registrado:', egresoRegistrado.codigo);
        
        // 4. Verificar el saldo después del egreso
        const cuentaDespuesEgreso = await CuentaBancaria.findById(cuentaPrueba._id);
        const saldoDespuesEgreso = cuentaDespuesEgreso.saldoActual;
        const diferencia = saldoInicialPrueba - saldoDespuesEgreso;
        
        console.log('📊 Resultados del egreso:');
        console.log('   Saldo inicial:', saldoInicialPrueba);
        console.log('   Saldo después del egreso:', saldoDespuesEgreso);
        console.log('   Diferencia:', diferencia);
        console.log('   Monto del egreso:', montoEgreso);
        
        if (Math.abs(diferencia - montoEgreso) < 0.01) {
            console.log('✅ EGRESO CORRECTO: El saldo se redujo correctamente');
        } else {
            console.log('❌ ERROR EN EGRESO: El saldo no se redujo correctamente');
            console.log('   Se esperaba una reducción de:', montoEgreso);
            console.log('   Se obtuvo una reducción de:', diferencia);
        }
        
        console.log('\n🔍 ========== PRUEBA 2: INGRESO BANCARIO ==========');
        
        // 5. Registrar un ingreso bancario
        const montoIngreso = 25.00;
        const datosIngreso = {
            monto: montoIngreso,
            concepto: 'Prueba de ingreso bancario',
            descripcion: 'Script de prueba para verificar integración',
            categoria: 'otros_ingresos',
            metodoPago: {
                tipo: 'transferencia',
                detalles: {
                    numeroOperacion: 'TEST-ING-' + Date.now(),
                    cuentaDestino: cuentaPrueba.numeroCuenta,
                    banco: cuentaPrueba.banco
                }
            },
            // Campos para integración bancaria
            afectaCuentaBancaria: true,
            cuentaBancariaId: cuentaPrueba._id.toString(),
            observaciones: 'Prueba de integración bancaria - Ingreso'
        };
        
        console.log('💰 Registrando ingreso bancario por $', montoIngreso);
        const ingresoRegistrado = await MovimientosCajaFinanzasService.registrarIngreso(datosIngreso, userData);
        console.log('✅ Ingreso registrado:', ingresoRegistrado.codigo);
        
        // 6. Verificar el saldo después del ingreso
        const cuentaDespuesIngreso = await CuentaBancaria.findById(cuentaPrueba._id);
        const saldoFinal = cuentaDespuesIngreso.saldoActual;
        const aumentoSaldo = saldoFinal - saldoDespuesEgreso;
        
        console.log('📊 Resultados del ingreso:');
        console.log('   Saldo antes del ingreso:', saldoDespuesEgreso);
        console.log('   Saldo después del ingreso:', saldoFinal);
        console.log('   Aumento:', aumentoSaldo);
        console.log('   Monto del ingreso:', montoIngreso);
        
        if (Math.abs(aumentoSaldo - montoIngreso) < 0.01) {
            console.log('✅ INGRESO CORRECTO: El saldo se incrementó correctamente');
        } else {
            console.log('❌ ERROR EN INGRESO: El saldo no se incrementó correctamente');
            console.log('   Se esperaba un aumento de:', montoIngreso);
            console.log('   Se obtuvo un aumento de:', aumentoSaldo);
        }
        
        console.log('\n🔍 ========== RESUMEN FINAL ==========');
        console.log('Saldo inicial de la cuenta:', saldoInicialPrueba);
        console.log('Egreso realizado:', -montoEgreso);
        console.log('Ingreso realizado:', montoIngreso);
        console.log('Saldo esperado:', saldoInicialPrueba - montoEgreso + montoIngreso);
        console.log('Saldo final real:', saldoFinal);
        
        const saldoEsperado = saldoInicialPrueba - montoEgreso + montoIngreso;
        if (Math.abs(saldoFinal - saldoEsperado) < 0.01) {
            console.log('✅ INTEGRACIÓN BANCARIA FUNCIONANDO CORRECTAMENTE');
        } else {
            console.log('❌ PROBLEMA EN LA INTEGRACIÓN BANCARIA');
        }
        
        // 7. Verificar que se crearon los movimientos bancarios
        console.log('\n🔍 ========== VERIFICACIÓN DE MOVIMIENTOS BANCARIOS ==========');
        
        const movimientosBancarios = await mongoose.model('MovimientoBancario').find({
            cuentaBancariaId: cuentaPrueba._id,
            concepto: { $regex: /Prueba de .* bancario/ }
        }).sort({ createdAt: -1 }).limit(2);
        
        console.log('📋 Movimientos bancarios creados:', movimientosBancarios.length);
        movimientosBancarios.forEach((mov, index) => {
            console.log(`   ${index + 1}. ${mov.tipo.toUpperCase()} - $${mov.monto} - ${mov.concepto}`);
        });
        
        if (movimientosBancarios.length === 2) {
            console.log('✅ Se crearon correctamente los movimientos bancarios');
        } else {
            console.log('❌ No se crearon todos los movimientos bancarios esperados');
        }
        
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
    testIntegracionBancaria().then(() => {
        console.log('🏁 Script de pruebas finalizado');
        process.exit(0);
    }).catch(error => {
        console.error('💥 Error fatal:', error);
        process.exit(1);
    });
}

module.exports = { testIntegracionBancaria };

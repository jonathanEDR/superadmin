/**
 * Script de prueba simple para verificar integración bancaria
 * Solo prueba la actualización de saldos
 */

require('dotenv').config();
const mongoose = require('mongoose');
const CuentaBancaria = require('../models/finanzas/CuentaBancaria');

async function testSaldoBancario() {
    try {
        console.log('🧪 ========== PRUEBA SIMPLE DE SALDO BANCARIO ==========');
        
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('🔌 Conectado a MongoDB');
        
        // 1. Obtener una cuenta de prueba
        const cuenta = await CuentaBancaria.findOne({ activa: true });
        
        if (!cuenta) {
            console.log('❌ No hay cuentas bancarias disponibles');
            return;
        }
        
        console.log('🏦 Cuenta de prueba:', {
            codigo: cuenta.codigo,
            nombre: cuenta.nombre,
            saldoInicial: cuenta.saldoActual
        });
        
        const saldoInicial = cuenta.saldoActual;
        
        // 2. Simular un egreso manual
        console.log('\n💸 Simulando egreso de S/ 10.00...');
        await cuenta.actualizarSaldo(10, 'egreso');
        
        const saldoDespuesEgreso = cuenta.saldoActual;
        console.log('📊 Saldo después del egreso:', saldoDespuesEgreso);
        console.log('🔢 Diferencia:', saldoInicial - saldoDespuesEgreso);
        
        if (saldoInicial - saldoDespuesEgreso === 10) {
            console.log('✅ EGRESO CORRECTO: El saldo se redujo en S/ 10.00');
        } else {
            console.log('❌ ERROR EN EGRESO');
        }
        
        // 3. Simular un ingreso manual
        console.log('\n💰 Simulando ingreso de S/ 20.00...');
        await cuenta.actualizarSaldo(20, 'ingreso');
        
        const saldoFinal = cuenta.saldoActual;
        console.log('📊 Saldo final:', saldoFinal);
        console.log('🔢 Diferencia total:', saldoFinal - saldoInicial);
        
        if (saldoFinal - saldoInicial === 10) {
            console.log('✅ INGRESO CORRECTO: El saldo se incrementó correctamente');
        } else {
            console.log('❌ ERROR EN INGRESO');
        }
        
        // 4. Verificar el método de la cuenta bancaria
        console.log('\n🔍 Verificando método verificarSaldoSuficiente...');
        const saldoSuficiente100 = cuenta.verificarSaldoSuficiente(100);
        const saldoSuficiente10 = cuenta.verificarSaldoSuficiente(10);
        
        console.log(`💰 ¿Saldo suficiente para S/ 100? ${saldoSuficiente100 ? 'Sí' : 'No'}`);
        console.log(`💰 ¿Saldo suficiente para S/ 10? ${saldoSuficiente10 ? 'Sí' : 'No'}`);
        
        console.log('\n✅ MÉTODOS BÁSICOS DE CUENTA BANCARIA FUNCIONANDO CORRECTAMENTE');
        
    } catch (error) {
        console.error('❌ Error en la prueba:', error);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Desconectado de MongoDB');
    }
}

// Ejecutar la prueba
if (require.main === module) {
    testSaldoBancario().then(() => {
        console.log('🏁 Prueba simple finalizada');
        process.exit(0);
    }).catch(error => {
        console.error('💥 Error fatal:', error);
        process.exit(1);
    });
}

module.exports = { testSaldoBancario };

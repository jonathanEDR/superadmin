const MovimientoCaja = require('../models/MovimientoCaja');

class CajaService {
  
  // Registrar movimiento en la caja
  static async registrarMovimiento(datos) {
    try {
      const movimiento = new MovimientoCaja(datos);
      await movimiento.save();
      return movimiento;
    } catch (error) {
      console.error('Error al registrar movimiento en caja:', error);
      throw error;
    }
  }

  // Obtener saldo actual
  static async obtenerSaldoActual(userId) {
    try {
      const ultimoMovimiento = await MovimientoCaja
        .findOne({ userId })
        .sort({ fecha: -1, createdAt: -1 });
      
      return ultimoMovimiento ? ultimoMovimiento.saldoActual : 0;
    } catch (error) {
      console.error('Error al obtener saldo actual:', error);
      throw error;
    }
  }

  // Obtener resumen de la caja
  static async obtenerResumenCaja(userId, periodo = 'day') {
    try {
      const fechaInicio = this.calcularFechaInicio(periodo);
      
      // Obtener saldo actual
      const saldoActual = await this.obtenerSaldoActual(userId);
      
      // Obtener movimientos del período
      const movimientos = await MovimientoCaja.find({
        userId,
        fecha: { $gte: fechaInicio }
      }).sort({ fecha: -1 });

      // Calcular totales del período
      const totalIngresos = movimientos
        .filter(m => m.tipo === 'ingreso')
        .reduce((sum, m) => sum + m.monto, 0);
      
      const totalEgresos = movimientos
        .filter(m => m.tipo === 'egreso')
        .reduce((sum, m) => sum + m.monto, 0);

      // Agrupar por categoría
      const ingresosPorCategoria = {};
      const egresosPorCategoria = {};
      
      movimientos.forEach(mov => {
        if (mov.tipo === 'ingreso') {
          ingresosPorCategoria[mov.categoria] = (ingresosPorCategoria[mov.categoria] || 0) + mov.monto;
        } else {
          egresosPorCategoria[mov.categoria] = (egresosPorCategoria[mov.categoria] || 0) + mov.monto;
        }
      });

      return {
        saldoActual,
        totalIngresos,
        totalEgresos,
        flujoNeto: totalIngresos - totalEgresos,
        cantidadMovimientos: movimientos.length,
        ingresosPorCategoria,
        egresosPorCategoria,
        movimientosRecientes: movimientos.slice(0, 10)
      };
    } catch (error) {
      console.error('Error al obtener resumen de caja:', error);
      throw error;
    }
  }

  // Obtener movimientos con filtros
  static async obtenerMovimientos(userId, filtros = {}) {
    try {
      const query = { userId };
      
      if (filtros.tipo) query.tipo = filtros.tipo;
      if (filtros.categoria) query.categoria = filtros.categoria;
      if (filtros.fechaInicio || filtros.fechaFin) {
        query.fecha = {};
        if (filtros.fechaInicio) query.fecha.$gte = new Date(filtros.fechaInicio);
        if (filtros.fechaFin) query.fecha.$lte = new Date(filtros.fechaFin);
      }

      const page = filtros.page || 1;
      const limit = filtros.limit || 50;
      const skip = (page - 1) * limit;

      const [movimientos, total] = await Promise.all([
        MovimientoCaja.find(query)
          .sort({ fecha: -1, createdAt: -1 })
          .skip(skip)
          .limit(limit),
        MovimientoCaja.countDocuments(query)
      ]);

      return {
        movimientos,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: limit
        }
      };
    } catch (error) {
      console.error('Error al obtener movimientos:', error);
      throw error;
    }
  }

  // Registrar desde otros módulos automáticamente
  static async registrarVenta(userId, venta) {
    return await this.registrarMovimiento({
      userId,
      tipo: 'ingreso',
      categoria: 'venta_directa',
      descripcion: `Venta - ${venta.colaboradorNombre || 'Directo'}`,
      monto: venta.montoTotal,
      fecha: venta.fechaVenta || new Date(),
      metodoPago: venta.metodoPago || 'efectivo',
      referenciaId: venta._id,
      referenciaModelo: 'Venta',
      colaboradorNombre: venta.colaboradorNombre,
      esAutomatico: true
    });
  }

  static async registrarCobro(userId, cobro) {
    return await this.registrarMovimiento({
      userId,
      tipo: 'ingreso',
      categoria: 'cobro',
      descripcion: `Cobro - ${cobro.colaboradorNombre || 'Cliente'}`,
      monto: cobro.montoPagado,
      fecha: cobro.fechaPago,
      metodoPago: cobro.yape > 0 ? 'yape' : 'efectivo',
      referenciaId: cobro._id,
      referenciaModelo: 'Cobro',
      colaboradorNombre: cobro.colaboradorNombre,
      esAutomatico: true
    });
  }

  static async registrarPagoPersonal(userId, pago) {
    return await this.registrarMovimiento({
      userId,
      tipo: 'egreso',
      categoria: 'pago_personal',
      descripcion: `Pago Personal - ${pago.colaboradorNombre || 'Empleado'}`,
      monto: pago.montoTotal,
      fecha: pago.fechaPago,
      metodoPago: pago.metodoPago || 'efectivo',
      referenciaId: pago._id,
      referenciaModelo: 'PagoRealizado',
      colaboradorNombre: pago.colaboradorNombre,
      esAutomatico: true
    });
  }

  static async registrarGasto(userId, gasto) {
    return await this.registrarMovimiento({
      userId,
      tipo: 'egreso',
      categoria: 'gasto_operativo',
      descripcion: `Gasto - ${gasto.descripcion}`,
      monto: gasto.monto,
      fecha: gasto.fecha,
      metodoPago: 'efectivo',
      referenciaId: gasto._id,
      referenciaModelo: 'Gasto',
      esAutomatico: true
    });
  }

  // Obtener estadísticas rápidas
  static async obtenerEstadisticasRapidas(userId) {
    try {
      const hoy = new Date();
      const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      const inicioSemana = new Date(hoy);
      inicioSemana.setDate(hoy.getDate() - hoy.getDay());

      const [saldoActual, estadisticasMes, estadisticasSemana] = await Promise.all([
        this.obtenerSaldoActual(userId),
        this.obtenerResumenCaja(userId, 'month'),
        this.obtenerResumenCaja(userId, 'week')
      ]);

      return {
        saldoActual,
        mes: {
          ingresos: estadisticasMes.totalIngresos,
          egresos: estadisticasMes.totalEgresos,
          flujo: estadisticasMes.flujoNeto
        },
        semana: {
          ingresos: estadisticasSemana.totalIngresos,
          egresos: estadisticasSemana.totalEgresos,
          flujo: estadisticasSemana.flujoNeto
        }
      };
    } catch (error) {
      console.error('Error al obtener estadísticas rápidas:', error);
      throw error;
    }
  }

  // Recalcular saldos después de una eliminación
  static async recalcularSaldos(userId) {
    try {
      const movimientos = await MovimientoCaja.find({ userId })
        .sort({ fecha: 1, createdAt: 1 });

      let saldoAcumulado = 0;
      
      for (const movimiento of movimientos) {
        const saldoAnterior = saldoAcumulado;
        
        if (movimiento.tipo === 'ingreso') {
          saldoAcumulado += movimiento.monto;
        } else {
          saldoAcumulado -= movimiento.monto;
        }
        
        // Actualizar el movimiento con los saldos correctos
        await MovimientoCaja.findByIdAndUpdate(movimiento._id, {
          saldoAnterior: saldoAnterior,
          saldoActual: saldoAcumulado
        });
      }
      
      return saldoAcumulado;
    } catch (error) {
      console.error('Error al recalcular saldos:', error);
      throw error;
    }
  }

  // Método auxiliar para calcular fecha de inicio
  static calcularFechaInicio(periodo) {
    const hoy = new Date();
    switch(periodo) {
      case 'day':
        return new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
      case 'week':
        const inicioSemana = new Date(hoy);
        inicioSemana.setDate(hoy.getDate() - hoy.getDay());
        return inicioSemana;
      case 'month':
        return new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      case 'year':
        return new Date(hoy.getFullYear(), 0, 1);
      default:
        return new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    }
  }
}

module.exports = CajaService;

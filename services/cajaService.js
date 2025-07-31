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
  static async obtenerSaldoActual(userId, userRole = 'user') {
    try {
      let query = { userId };
      
      // Si es admin o super_admin, obtener el saldo consolidado de todos los usuarios
      if (['admin', 'super_admin'].includes(userRole)) {
        query = {}; // Sin filtro de userId para ver todos los movimientos
      }
      
      // Para admin/super_admin, calcular saldo consolidado con filtro de duplicados
      if (['admin', 'super_admin'].includes(userRole)) {
        const todosMovimientos = await MovimientoCaja.find({}).sort({ fecha: 1, createdAt: 1 });
        
        // Aplicar el mismo filtro de duplicados que en obtenerMovimientos
        const movimientosFiltrados = [];
        const pagosPersonalesVistos = new Map();

        for (const movimiento of todosMovimientos) {
          if (movimiento.categoria === 'pago_personal') {
            // Crear una clave única basada en colaboradorNombre, monto y fecha
            const fechaStr = new Date(movimiento.fecha).toISOString().split('T')[0];
            const claveUnica = `${movimiento.colaboradorNombre || 'sin_nombre'}_${movimiento.monto}_${fechaStr}`;
            
            if (!pagosPersonalesVistos.has(claveUnica)) {
              // Primera vez que vemos este pago personal
              pagosPersonalesVistos.set(claveUnica, movimiento);
              movimientosFiltrados.push(movimiento);
            } else {
              // Ya existe un movimiento similar
              const movimientoExistente = pagosPersonalesVistos.get(claveUnica);
              
              // Priorizar el que tiene referenciaModelo 'PagoRealizado'
              if (movimiento.referenciaModelo === 'PagoRealizado' && 
                  movimientoExistente.referenciaModelo !== 'PagoRealizado') {
                
                // Reemplazar el movimiento existente en el array filtrado
                const indiceExistente = movimientosFiltrados.findIndex(m => {
                  const fechaExistenteStr = new Date(m.fecha).toISOString().split('T')[0];
                  const claveExistente = `${m.colaboradorNombre || 'sin_nombre'}_${m.monto}_${fechaExistenteStr}`;
                  return claveExistente === claveUnica;
                });
                
                if (indiceExistente !== -1) {
                  movimientosFiltrados[indiceExistente] = movimiento;
                  pagosPersonalesVistos.set(claveUnica, movimiento);
                }
              }
            }
          } else {
            // No es pago personal, agregar normalmente
            movimientosFiltrados.push(movimiento);
          }
        }
        
        // Calcular saldo con movimientos filtrados
        let saldoConsolidado = 0;
        movimientosFiltrados.forEach(mov => {
          if (mov.tipo === 'ingreso') {
            saldoConsolidado += mov.monto;
          } else {
            saldoConsolidado -= mov.monto;
          }
        });
        
        return saldoConsolidado;
      }
      
      const ultimoMovimiento = await MovimientoCaja
        .findOne(query)
        .sort({ fecha: -1, createdAt: -1 });
      
      return ultimoMovimiento ? ultimoMovimiento.saldoActual : 0;
    } catch (error) {
      console.error('Error al obtener saldo actual:', error);
      throw error;
    }
  }

  // Obtener resumen de la caja
  static async obtenerResumenCaja(userId, periodo = 'day', userRole = 'user') {
    try {
      const fechaInicio = this.calcularFechaInicio(periodo);
      
      // Obtener saldo actual
      const saldoActual = await this.obtenerSaldoActual(userId, userRole);
      
      // Configurar query según el rol
      let movimientosQuery = {
        fecha: { $gte: fechaInicio }
      };
      
      // Solo filtrar por userId si no es admin o super_admin
      if (!['admin', 'super_admin'].includes(userRole)) {
        movimientosQuery.userId = userId;
      }
      
      // Obtener movimientos del período
      const movimientos = await MovimientoCaja.find(movimientosQuery).sort({ fecha: -1 });

      // Para admin y super_admin, aplicar filtro de duplicados también aquí
      let movimientosFiltrados = movimientos;
      if (['admin', 'super_admin'].includes(userRole)) {
        const movimientosFiltradosArray = [];
        const pagosPersonalesVistos = new Map();

        for (const movimiento of movimientos) {
          if (movimiento.categoria === 'pago_personal') {
            const fechaStr = new Date(movimiento.fecha).toISOString().split('T')[0];
            const claveUnica = `${movimiento.colaboradorNombre || 'sin_nombre'}_${movimiento.monto}_${fechaStr}`;
            
            if (!pagosPersonalesVistos.has(claveUnica)) {
              pagosPersonalesVistos.set(claveUnica, movimiento);
              movimientosFiltradosArray.push(movimiento);
            } else {
              const movimientoExistente = pagosPersonalesVistos.get(claveUnica);
              
              if (movimiento.referenciaModelo === 'PagoRealizado' && 
                  movimientoExistente.referenciaModelo !== 'PagoRealizado') {
                
                const indiceExistente = movimientosFiltradosArray.findIndex(m => {
                  const fechaExistenteStr = new Date(m.fecha).toISOString().split('T')[0];
                  const claveExistente = `${m.colaboradorNombre || 'sin_nombre'}_${m.monto}_${fechaExistenteStr}`;
                  return claveExistente === claveUnica;
                });
                
                if (indiceExistente !== -1) {
                  movimientosFiltradosArray[indiceExistente] = movimiento;
                  pagosPersonalesVistos.set(claveUnica, movimiento);
                }
              }
            }
          } else {
            movimientosFiltradosArray.push(movimiento);
          }
        }
        
        movimientosFiltrados = movimientosFiltradosArray;
      }

      // Calcular totales del período con movimientos filtrados
      const totalIngresos = movimientosFiltrados
        .filter(m => m.tipo === 'ingreso')
        .reduce((sum, m) => sum + m.monto, 0);
      
      const totalEgresos = movimientosFiltrados
        .filter(m => m.tipo === 'egreso')
        .reduce((sum, m) => sum + m.monto, 0);

      // Agrupar por categoría con movimientos filtrados
      const ingresosPorCategoria = {};
      const egresosPorCategoria = {};
      
      movimientosFiltrados.forEach(mov => {
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
        cantidadMovimientos: movimientosFiltrados.length,
        ingresosPorCategoria,
        egresosPorCategoria,
        movimientosRecientes: movimientosFiltrados.slice(0, 10)
      };
    } catch (error) {
      console.error('Error al obtener resumen de caja:', error);
      throw error;
    }
  }

  // Obtener movimientos con filtros
  static async obtenerMovimientos(userId, filtros = {}, userRole = 'user') {
    try {
      let query = {};
      
      // Solo filtrar por userId si no es admin o super_admin
      if (!['admin', 'super_admin'].includes(userRole)) {
        query.userId = userId;
      }
      
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

      // Para admin y super_admin, filtrar duplicados de pagos personales
      if (['admin', 'super_admin'].includes(userRole)) {
        const movimientosFiltrados = [];
        const pagosPersonalesVistos = new Map();

        for (const movimiento of movimientos) {
          if (movimiento.categoria === 'pago_personal') {
            // Crear una clave única basada en colaboradorNombre, monto y fecha
            const fechaStr = new Date(movimiento.fecha).toISOString().split('T')[0]; // Solo la fecha, sin hora
            const claveUnica = `${movimiento.colaboradorNombre || 'sin_nombre'}_${movimiento.monto}_${fechaStr}`;
            
            if (!pagosPersonalesVistos.has(claveUnica)) {
              // Primera vez que vemos este pago personal
              pagosPersonalesVistos.set(claveUnica, movimiento);
              movimientosFiltrados.push(movimiento);
            } else {
              // Ya existe un movimiento similar
              const movimientoExistente = pagosPersonalesVistos.get(claveUnica);
              
              // Priorizar el que tiene referenciaModelo 'PagoRealizado'
              if (movimiento.referenciaModelo === 'PagoRealizado' && 
                  movimientoExistente.referenciaModelo !== 'PagoRealizado') {
                
                // Reemplazar el movimiento existente en el array filtrado
                const indiceExistente = movimientosFiltrados.findIndex(m => {
                  const fechaExistenteStr = new Date(m.fecha).toISOString().split('T')[0];
                  const claveExistente = `${m.colaboradorNombre || 'sin_nombre'}_${m.monto}_${fechaExistenteStr}`;
                  return claveExistente === claveUnica;
                });
                
                if (indiceExistente !== -1) {
                  movimientosFiltrados[indiceExistente] = movimiento;
                  pagosPersonalesVistos.set(claveUnica, movimiento);
                }
              }
              // Si el actual es 'Gasto' o el existente ya es 'PagoRealizado', ignorar el actual
            }
          } else {
            // No es pago personal, agregar normalmente
            movimientosFiltrados.push(movimiento);
          }
        }

        console.log(`Filtrados ${movimientos.length} movimientos a ${movimientosFiltrados.length}`);
        
        return {
          movimientos: movimientosFiltrados,
          pagination: {
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            totalItems: total,
            itemsPerPage: limit
          }
        };
      }

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
  static async obtenerEstadisticasRapidas(userId, userRole = 'user') {
    try {
      const hoy = new Date();
      const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      const inicioSemana = new Date(hoy);
      inicioSemana.setDate(hoy.getDate() - hoy.getDay());

      const [saldoActual, estadisticasMes, estadisticasSemana] = await Promise.all([
        this.obtenerSaldoActual(userId, userRole),
        this.obtenerResumenCaja(userId, 'month', userRole),
        this.obtenerResumenCaja(userId, 'week', userRole)
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

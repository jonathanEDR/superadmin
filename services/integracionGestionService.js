const Venta = require('../models/Venta');
const Cobro = require('../models/Cobro');
const User = require('../models/User');
const GestionPersonal = require('../models/GestionPersonal');

/**
 * Servicio para integrar datos entre Ventas, Cobros y Gestión Personal
 */

// Obtener resumen CORREGIDO de faltantes y gastos por colaborador
// VERSIÓN FINAL: Solo busca ventas del colaborador como PROPIETARIO y sus cobros relacionados
const obtenerResumenCobrosColaboradorCorregido = async (colaboradorUserId) => {
  try {
    // PASO 1: Buscar SOLO las ventas donde el colaborador es PROPIETARIO (userId)
    const ventas = await Venta.find({ 
      userId: colaboradorUserId
    }).select('_id montoTotal fechadeVenta userId');
    
    if (ventas.length === 0) {
      return {
        colaboradorUserId,
        totalVentas: 0,
        totalCobros: 0,
        totalFaltantes: 0,
        totalGastosImprevistos: 0,
        cobrosDetalle: [],
        mensaje: 'No se encontraron ventas donde este colaborador sea propietario'
      };
    }
    
    const ventasIds = ventas.map(venta => venta._id);
    
    // PASO 2: Buscar SOLO cobros que tienen relación con las ventas del colaborador
    const cobros = await Cobro.find({ 
      ventasId: { $in: ventasIds }
    }).sort({ fechaCobro: -1 });
    
    if (cobros.length === 0) {
      return {
        colaboradorUserId,
        totalVentas: ventas.length,
        totalCobros: 0,
        totalFaltantes: 0,
        totalGastosImprevistos: 0,
        cobrosDetalle: [],
        mensaje: `Se encontraron ${ventas.length} ventas del propietario pero no tienen cobros asociados`
      };
    }
    
    // PASO 3: Mapear cobros con fechas de venta específicas
    let totalFaltantes = 0;
    let totalGastosImprevistos = 0;
    
    // Crear mapa de ventas para acceso rápido
    const ventasMap = {};
    ventas.forEach(venta => {
      ventasMap[venta._id.toString()] = venta;
    });
    
    const cobrosDetalle = cobros.map(cobro => {
      const faltantes = Number(cobro.faltantes) || 0;
      const gastos = Number(cobro.gastosImprevistos) || 0;
      
      totalFaltantes += faltantes;
      totalGastosImprevistos += gastos;
      
      // Obtener fechas de venta relacionadas
      const ventasRelacionadas = (cobro.ventasId || []).map(ventaId => {
        const venta = ventasMap[ventaId.toString()];
        return venta ? {
          ventaId: venta._id,
          fechaVenta: venta.fechadeVenta,
          montoVenta: venta.montoTotal
        } : null;
      }).filter(Boolean);
      
      console.log(`   📝 Cobro ${cobro._id}: Faltantes=${faltantes}, Gastos=${gastos}, VentasRelacionadas=${ventasRelacionadas.length}`);
      
      return {
        cobroId: cobro._id,
        fechaCobro: cobro.fechaCobro,
        faltantes: faltantes,
        gastosImprevistos: gastos,
        descripcion: cobro.descripcion || '',
        montoPagado: cobro.montoPagado || 0,
        creadorCobro: cobro.creatorId,
        ventasRelacionadas: ventasRelacionadas, // INCLUYE FECHAS DE VENTA
        tipoRelacion: 'venta_propietario'
      };
    });
    
    console.log(`✅ TOTALES FINALES CORREGIDOS para ${colaboradorUserId}:`);
    console.log(`   💰 Total Faltantes: ${totalFaltantes}`);
    console.log(`   💸 Total Gastos Imprevistos: ${totalGastosImprevistos}`);
    console.log(`   🛍️ Ventas como propietario: ${ventas.length}`);
    console.log(`   💳 Cobros de sus ventas: ${cobros.length}`);
    
    return {
      colaboradorUserId,
      totalVentas: ventas.length,
      totalCobros: cobros.length,
      totalFaltantes,
      totalGastosImprevistos,
      cobrosDetalle,
      ventasDetalle: ventas.map(venta => ({
        ventaId: venta._id,
        montoTotal: venta.montoTotal,
        fechaVenta: venta.fechadeVenta,
        esPropietario: true // Siempre es propietario en esta función
      })),
      logicaAplicada: 'ventas_propietario_cobros_relacionados',
      mensaje: `Se encontraron ${cobros.length} cobros de ${ventas.length} ventas (como propietario) con ${totalFaltantes} en faltantes y ${totalGastosImprevistos} en gastos`
    };
    
  } catch (error) {
    console.error('❌ Error al obtener resumen corregido de cobros:', error);
    throw new Error(`Error al obtener resumen corregido de cobros: ${error.message}`);
  }
};

// NUEVA FUNCIÓN: Diagnóstico y validación de la relación Ventas → Cobros → Gestión Personal
const diagnosticarRelacionVentasCobrosGestion = async (colaboradorUserId) => {
  try {
    console.log('🔍 DIAGNÓSTICO COMPLETO para colaborador:', colaboradorUserId);
    
    // 1. Verificar usuario existe
    const usuario = await User.findOne({ clerk_id: colaboradorUserId });
    if (!usuario) {
      throw new Error(`Usuario con clerk_id ${colaboradorUserId} no encontrado`);
    }
    
    // 2. Analizar ventas - SOLO como propietario (userId)
    const ventasComoPropietario = await Venta.find({ userId: colaboradorUserId });
    const ventasComoCreador = await Venta.find({ creatorId: colaboradorUserId });
    
    // 3. Analizar cobros - SOLO los relacionados con las ventas como propietario
    const ventasIds = ventasComoPropietario.map(v => v._id);
    const cobrosDeVentasPropias = await Cobro.find({ ventasId: { $in: ventasIds } });
    
    // También analizamos cobros directos (para comparación)
    const cobrosComoUsuario = await Cobro.find({ userId: colaboradorUserId });
    const cobrosComoCreador = await Cobro.find({ creatorId: colaboradorUserId });
    
    // 4. Analizar registros de gestión personal
    const registrosGestion = await GestionPersonal.find({ colaboradorUserId });
    
    // 5. Calcular inconsistencias
    const cobrosSinVentas = await Cobro.find({
      userId: colaboradorUserId,
      $or: [
        { ventasId: { $exists: false } },
        { ventasId: { $size: 0 } }
      ]
    });
    
    const ventasSinCobros = [];
    for (const venta of ventasComoPropietario) {
      const tieneCobros = await Cobro.findOne({ ventasId: venta._id });
      if (!tieneCobros) {
        ventasSinCobros.push(venta);
      }
    }
    
    const diagnostico = {
      usuario: {
        existe: true,
        nombre: usuario.nombre_negocio,
        email: usuario.email,
        sueldo: usuario.sueldo
      },
      ventas: {
        comoPropietario: ventasComoPropietario.length,
        comoCreador: ventasComoCreador.length,
        montoTotalComoPropietario: ventasComoPropietario.reduce((sum, v) => sum + v.montoTotal, 0),
        logicaCorrecta: 'Solo ventas como propietario (userId) son relevantes para cobros'
      },
      cobros: {
        deVentasPropias: cobrosDeVentasPropias.length,
        comoUsuarioDirecto: cobrosComoUsuario.length,
        comoCreador: cobrosComoCreador.length,
        totalFaltantesVentasPropias: cobrosDeVentasPropias.reduce((sum, c) => sum + (c.faltantes || 0), 0),
        totalGastosVentasPropias: cobrosDeVentasPropias.reduce((sum, c) => sum + (c.gastosImprevistos || 0), 0),
        logicaCorrecta: 'Solo cobros relacionados con ventas propias (userId) deben considerarse'
      },
      gestionPersonal: {
        totalRegistros: registrosGestion.length,
        totalFaltantes: registrosGestion.reduce((sum, r) => sum + (r.faltante || 0), 0),
        totalGastos: registrosGestion.reduce((sum, r) => sum + (r.monto || 0), 0)
      },
      inconsistencias: {
        cobrosSinVentas: cobrosSinVentas.length,
        ventasSinCobros: ventasSinCobros.length,
        detalleCobrosSinVentas: cobrosSinVentas.map(c => ({
          id: c._id,
          fecha: c.fechaCobro,
          monto: c.montoPagado
        })),
        detalleVentasSinCobros: ventasSinCobros.map(v => ({
          id: v._id,
          fecha: v.fechadeVenta,
          monto: v.montoTotal
        }))
      }
    };
    
    console.log('📊 DIAGNÓSTICO COMPLETADO:', diagnostico);
    return diagnostico;
    
  } catch (error) {
    console.error('❌ Error en diagnóstico:', error);
    throw new Error(`Error en diagnóstico: ${error.message}`);
  }
};

// Obtener resumen SIMPLE de faltantes y gastos por colaborador desde los cobros
// Sin filtros de fecha - acumula TODOS los faltantes y gastos del colaborador
const obtenerResumenCobrosColaboradorSimple = async (colaboradorUserId) => {
  try {
    console.log('🔍 Obteniendo resumen SIMPLE de cobros para colaborador:', colaboradorUserId);
    
    // Buscar TODOS los cobros del colaborador directamente
    const cobros = await Cobro.find({ 
      userId: colaboradorUserId 
    }).sort({ fechaCobro: -1 });
    
    console.log(`📊 Cobros encontrados para ${colaboradorUserId}: ${cobros.length}`);
    
    if (cobros.length === 0) {
      return {
        colaboradorUserId,
        totalCobros: 0,
        totalFaltantes: 0,
        totalGastosImprevistos: 0,
        cobrosDetalle: [],
        mensaje: 'No se encontraron cobros para este colaborador'
      };
    }
    
    // Calcular totales acumulados
    let totalFaltantes = 0;
    let totalGastosImprevistos = 0;
    let totalCobros = cobros.length;
    
    const cobrosDetalle = cobros.map(cobro => {
      const faltantes = cobro.faltantes || 0;
      const gastos = cobro.gastosImprevistos || 0;
      
      totalFaltantes += faltantes;
      totalGastosImprevistos += gastos;
      
      console.log(`   📝 Cobro ${cobro._id}: Faltantes=${faltantes}, Gastos=${gastos}`);
      
      return {
        cobroId: cobro._id,
        fechaCobro: cobro.fechaCobro,
        faltantes: faltantes,
        gastosImprevistos: gastos,
        descripcion: cobro.descripcion || '',
        estado: cobro.estado
      };
    });
    
    console.log(`✅ TOTALES ACUMULADOS para ${colaboradorUserId}:`);
    console.log(`   💰 Total Faltantes: ${totalFaltantes}`);
    console.log(`   💸 Total Gastos Imprevistos: ${totalGastosImprevistos}`);
    
    return {
      colaboradorUserId,
      totalCobros,
      totalFaltantes,
      totalGastosImprevistos,
      cobrosDetalle,
      mensaje: `Se encontraron ${totalCobros} cobros con ${totalFaltantes} en faltantes y ${totalGastosImprevistos} en gastos`
    };
    
  } catch (error) {
    console.error('❌ Error al obtener resumen de cobros:', error);
    throw new Error(`Error al obtener resumen de cobros: ${error.message}`);
  }
};

// Obtener resumen de faltantes y gastos por colaborador desde los cobros (VERSIÓN ORIGINAL CON FECHAS)
const obtenerResumenCobrosColaborador = async (colaboradorUserId, fechaInicio = null, fechaFin = null) => {
  try {
    console.log('Obteniendo resumen de cobros para colaborador:', colaboradorUserId);
    
    // Buscar todas las ventas del colaborador
    let queryVentas = { userId: colaboradorUserId };
    
    // Aplicar filtro de fechas si se proporciona
    if (fechaInicio && fechaFin) {
      queryVentas.fechadeVenta = {
        $gte: new Date(fechaInicio),
        $lte: new Date(fechaFin)
      };
    }
    
    const ventas = await Venta.find(queryVentas).select('_id montoTotal fechadeVenta');
    
    if (ventas.length === 0) {
      return {
        colaboradorUserId,
        totalVentas: 0,
        totalCobros: 0,
        totalFaltantes: 0,
        totalGastosImprevistos: 0,
        cobrosDetalle: [],
        mensaje: 'No se encontraron ventas para este colaborador'
      };
    }
    
    const ventasIds = ventas.map(venta => venta._id);
    
    // Buscar cobros relacionados a estas ventas
    let queryCobros = { 
      ventasId: { $in: ventasIds }
    };
    
    // Aplicar filtro de fechas en cobros también
    if (fechaInicio && fechaFin) {
      queryCobros.fechaCobro = {
        $gte: new Date(fechaInicio),
        $lte: new Date(fechaFin)
      };
    }
    
    const cobros = await Cobro.find(queryCobros)
      .populate('ventasId', 'montoTotal fechadeVenta')
      .sort({ fechaCobro: -1 });
    
    // Calcular totales
    let totalFaltantes = 0;
    let totalGastosImprevistos = 0;
    let totalCobros = 0;
    
    const cobrosDetalle = cobros.map(cobro => {
      totalFaltantes += cobro.faltantes || 0;
      totalGastosImprevistos += cobro.gastosImprevistos || 0;
      totalCobros += cobro.montoPagado || 0;
      
      return {
        cobroId: cobro._id,
        fechaCobro: cobro.fechaCobro,
        montoPagado: cobro.montoPagado,
        faltantes: cobro.faltantes || 0,
        gastosImprevistos: cobro.gastosImprevistos || 0,
        descripcion: cobro.descripcion || '',
        ventasRelacionadas: cobro.ventasId.length
      };
    });
    
    return {
      colaboradorUserId,
      totalVentas: ventas.length,
      montoTotalVentas: ventas.reduce((sum, venta) => sum + (venta.montoTotal || 0), 0),
      totalCobros: cobros.length,
      totalMontoCobrado: totalCobros,
      totalFaltantes,
      totalGastosImprevistos,
      cobrosDetalle,
      periodo: {
        fechaInicio: fechaInicio || 'Sin filtro',
        fechaFin: fechaFin || 'Sin filtro'
      }
    };
    
  } catch (error) {
    console.error('Error al obtener resumen de cobros:', error);
    throw new Error('Error al obtener resumen de cobros del colaborador: ' + error.message);
  }
};

// Obtener datos sugeridos para nuevo registro de gestión personal
const obtenerDatosSugeridosGestion = async (colaboradorUserId, fechaGestion) => {
  try {
    console.log('Obteniendo datos sugeridos para:', colaboradorUserId, 'fecha:', fechaGestion);
    
    // Obtener información del colaborador
    const colaborador = await User.findOne({ 
      clerk_id: colaboradorUserId,
      is_active: true 
    }).select('clerk_id nombre_negocio email sueldo departamento role');
    
    if (!colaborador) {
      throw new Error('Colaborador no encontrado');
    }
    
    // Obtener cobros del día específico
    const fechaInicio = new Date(fechaGestion);
    fechaInicio.setHours(0, 0, 0, 0);
    
    const fechaFin = new Date(fechaGestion);
    fechaFin.setHours(23, 59, 59, 999);
    
    console.log('Buscando cobros entre:', fechaInicio.toISOString(), 'y', fechaFin.toISOString());
    
    const resumenCobros = await obtenerResumenCobrosColaborador(
      colaboradorUserId, 
      fechaInicio.toISOString().split('T')[0], // Solo fecha YYYY-MM-DD
      fechaFin.toISOString().split('T')[0]     // Solo fecha YYYY-MM-DD
    );
    
    // Calcular pago diario sugerido
    const pagodiarioSugerido = colaborador.sueldo ? 
      Math.round((colaborador.sueldo / 30) * 100) / 100 : 0;
    
    // Verificar si ya existe un registro para esta fecha
    const registroExistente = await GestionPersonal.findOne({
      colaboradorUserId,
      fechaDeGestion: {
        $gte: fechaInicio,
        $lte: fechaFin
      }
    });
    
    return {
      colaborador: {
        userId: colaborador.clerk_id,
        nombre: colaborador.nombre_negocio,
        email: colaborador.email,
        sueldo: colaborador.sueldo,
        departamento: colaborador.departamento
      },
      datosSugeridos: {
        faltante: resumenCobros.totalFaltantes,
        gastosImprevistos: resumenCobros.totalGastosImprevistos,
        pagodiario: pagodiarioSugerido,
        descripcionSugerida: resumenCobros.totalCobros > 0 ? 
          `Gestión del ${new Date(fechaGestion).toLocaleDateString()} - ${resumenCobros.totalCobros} cobro(s) registrado(s)` :
          `Gestión del ${new Date(fechaGestion).toLocaleDateString()}`
      },
      resumenCobros,
      registroExistente: registroExistente ? {
        id: registroExistente._id,
        mensaje: 'Ya existe un registro para esta fecha'
      } : null
    };
    
  } catch (error) {
    console.error('Error al obtener datos sugeridos:', error);
    throw new Error('Error al obtener datos sugeridos: ' + error.message);
  }
};

// Obtener historial completo de un colaborador (ventas, cobros, gestión)
const obtenerHistorialCompletoColaborador = async (colaboradorUserId, limite = 50) => {
  try {
    console.log('Obteniendo historial completo para:', colaboradorUserId);
    
    // Obtener información del colaborador
    const colaborador = await User.findOne({ 
      clerk_id: colaboradorUserId,
      is_active: true 
    }).select('clerk_id nombre_negocio email sueldo departamento');
    
    if (!colaborador) {
      throw new Error('Colaborador no encontrado');
    }
    
    // Obtener ventas recientes
    const ventas = await Venta.find({ userId: colaboradorUserId })
      .sort({ fechadeVenta: -1 })
      .limit(limite)
      .select('_id montoTotal fechadeVenta estadoPago');
    
    // Obtener registros de gestión personal
    const registrosGestion = await GestionPersonal.find({ colaboradorUserId })
      .sort({ fechaDeGestion: -1 })
      .limit(limite);
    
    // Obtener resumen general de cobros
    const resumenCobros = await obtenerResumenCobrosColaborador(colaboradorUserId);
    
    return {
      colaborador: {
        userId: colaborador.clerk_id,
        nombre: colaborador.nombre_negocio,
        email: colaborador.email,
        sueldo: colaborador.sueldo,
        departamento: colaborador.departamento
      },
      estadisticas: {
        totalVentas: ventas.length,
        montoTotalVentas: ventas.reduce((sum, venta) => sum + (venta.montoTotal || 0), 0),
        registrosGestion: registrosGestion.length,
        totalFaltantesHistorico: resumenCobros.totalFaltantes,
        totalGastosHistorico: resumenCobros.totalGastosImprevistos
      },
      ventasRecientes: ventas,
      registrosGestionRecientes: registrosGestion,
      resumenCobros
    };
    
  } catch (error) {
    console.error('Error al obtener historial completo:', error);
    throw new Error('Error al obtener historial completo: ' + error.message);
  }
};

module.exports = {
  obtenerResumenCobrosColaborador,
  obtenerResumenCobrosColaboradorSimple,
  obtenerResumenCobrosColaboradorCorregido,
  diagnosticarRelacionVentasCobrosGestion,
  obtenerDatosSugeridosGestion,
  obtenerHistorialCompletoColaborador
};

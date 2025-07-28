const GestionPersonal = require('../models/GestionPersonal');
const User = require('../models/User');
const { convertirFechaALocalUtc } = require('../utils/fechaHoraUtils');

// Función auxiliar para validar y parsear números
const parsearNumero = (valor, defecto = 0) => {
  const num = parseFloat(valor);
  return isNaN(num) ? defecto : num;
};

// Crear nuevo registro
const crearRegistro = async (data) => {
  const {
    userId, // Clerk ID del usuario autenticado
    colaboradorUserId, // Clerk ID del colaborador
    fechaDeGestion,
    descripcion,
    monto = 0,
    faltante = 0,
    adelanto = 0,
    pagodiario = 0,
    diasLaborados = 1,
    colaboradorInfo,
    cobrosRelacionados = [],
    datosSugeridos = false,
    fuenteDatos = 'manual',
    incluirDatosCobros = false // Nuevo flag para incluir datos automáticos
  } = data;

  if (!userId) {
    throw new Error('userId es requerido');
  }

  // Buscar al colaborador (usuario) si no se proporciona la info
  let infoColaborador = colaboradorInfo;
  if (!infoColaborador) {
    const colaborador = await User.findOne({
      clerk_id: colaboradorUserId,
      is_active: true
    });
    if (!colaborador) {
      throw new Error('Colaborador no encontrado');
    }
    
    infoColaborador = {
      nombre: colaborador.nombre_negocio,
      email: colaborador.email,
      sueldo: colaborador.sueldo,
      departamento: colaborador.departamento
    };
  }

  const fechaDeGestionUtc = convertirFechaALocalUtc(fechaDeGestion);

  // Variables para los montos finales
  let montoFinal = parsearNumero(monto);
  let faltanteFinal = parsearNumero(faltante);
  let cobrosRelacionadosFinal = cobrosRelacionados;
  let fuenteDatosFinal = fuenteDatos;

  // Si se solicita incluir datos de cobros automáticamente
  if (incluirDatosCobros) {
    try {
      const integracionService = require('./integracionGestionService');
      
      console.log(`🔍 Obteniendo datos automáticos para ${colaboradorUserId} con función CORREGIDA...`);
      
      // Usar la función CORREGIDA que relaciona ventas → cobros correctamente
      // Esta función busca las ventas del colaborador y luego los cobros relacionados
      const resumenCobros = await integracionService.obtenerResumenCobrosColaboradorCorregido(
        colaboradorUserId
      );

      console.log(`� Resultados para ${colaboradorUserId}:`);
      console.log(`   - Ventas encontradas: ${resumenCobros.totalVentas}`);
      console.log(`   - Cobros relacionados: ${resumenCobros.totalCobros}`);
      console.log(`   - Total faltantes: ${resumenCobros.totalFaltantes}`);
      console.log(`   - Total gastos: ${resumenCobros.totalGastosImprevistos}`);

      // Agregar faltantes y gastos automáticamente
      if (resumenCobros.totalFaltantes > 0 || resumenCobros.totalGastosImprevistos > 0) {
        montoFinal += resumenCobros.totalGastosImprevistos;
        faltanteFinal += resumenCobros.totalFaltantes;
        
        // Agregar referencias a cobros con más detalle
        cobrosRelacionadosFinal = resumenCobros.cobrosDetalle.map(cobro => ({
          cobroId: cobro.cobroId,
          montoFaltante: cobro.faltantes,
          montoGastoImprevisto: cobro.gastosImprevistos,
          tipoRelacion: cobro.tipoRelacion,
          fechaCobro: cobro.fechaCobro
        }));

        fuenteDatosFinal = 'automatico_cobros';
        
        console.log(`✅ Datos automáticos agregados para ${colaboradorUserId}:`, {
          gastosImprevistos: resumenCobros.totalGastosImprevistos,
          faltantes: resumenCobros.totalFaltantes,
          cobrosRelacionados: cobrosRelacionadosFinal.length,
          ventasRelacionadas: resumenCobros.totalVentas
        });
      } else {
        console.log(`ℹ️ No se encontraron faltantes ni gastos para ${colaboradorUserId}:`);
        console.log(`   - Total de ventas analizadas: ${resumenCobros.totalVentas}`);
        console.log(`   - Total de cobros analizados: ${resumenCobros.totalCobros}`);
      }

    } catch (error) {
      console.warn('⚠️ No se pudieron obtener datos automáticos de cobros:', error.message);
      console.warn('   Continuando con el registro manual...');
      // Continuar con el registro manual
    }
  }

  // Crear el nuevo registro de gestión personal
  const nuevoRegistro = new GestionPersonal({
    userId,
    colaboradorUserId,
    fechaDeGestion: fechaDeGestionUtc,
    descripcion: descripcion.trim(),
    monto: montoFinal,
    faltante: faltanteFinal,
    adelanto: parsearNumero(adelanto),
    pagodiario: parsearNumero(pagodiario, 0),
    diasLaborados: parseInt(diasLaborados) || 1,
    colaboradorInfo: infoColaborador,
    cobrosRelacionados: cobrosRelacionadosFinal,
    datosSugeridos: incluirDatosCobros,
    fuenteDatos: fuenteDatosFinal
  });

  await nuevoRegistro.save();
  return nuevoRegistro;
};

// Obtener registros por colaborador
const obtenerRegistrosPorColaborador = async (userId, colaboradorUserId, filtros = {}) => {
  try {
    const query = { 
      userId, 
      colaboradorUserId 
    };

    // Aplicar filtros de fecha si se proporcionan
    if (filtros.fechaInicio && filtros.fechaFin) {
      query.fechaDeGestion = {
        $gte: new Date(filtros.fechaInicio),
        $lte: new Date(filtros.fechaFin)
      };
    }

    const registros = await GestionPersonal.find(query)
      .sort({ fechaDeGestion: -1 });
    
    return registros;
  } catch (error) {
    throw new Error('Error al obtener registros del colaborador: ' + error.message);
  }
};

// Obtener estadísticas de un colaborador
const obtenerEstadisticasColaborador = async (userId, colaboradorUserId) => {
  try {
    const registros = await GestionPersonal.find({ userId, colaboradorUserId });
    
    const estadisticas = registros.reduce((stats, registro) => ({
      totalGastos: stats.totalGastos + (registro.monto || 0),
      totalFaltantes: stats.totalFaltantes + (registro.faltante || 0),
      totalAdelantos: stats.totalAdelantos + (registro.adelanto || 0),
      totalPagosDiarios: stats.totalPagosDiarios + (registro.pagodiario || 0),
      totalRegistros: stats.totalRegistros + 1
    }), {
      totalGastos: 0,
      totalFaltantes: 0,
      totalAdelantos: 0,
      totalPagosDiarios: 0,
      totalRegistros: 0
    });

    // Calcular total a pagar
    estadisticas.totalAPagar = estadisticas.totalPagosDiarios - (estadisticas.totalFaltantes + estadisticas.totalAdelantos);

    return estadisticas;
  } catch (error) {
    throw new Error('Error al calcular estadísticas: ' + error.message);
  }
};

// NUEVA FUNCIÓN: Obtener estadísticas mejoradas con datos automáticos de cobros
const obtenerEstadisticasColaboradorConCobros = async (userId, colaboradorUserId) => {
  try {
    console.log(`🔍 Obteniendo estadísticas mejoradas para colaborador: ${colaboradorUserId}`);
    
    // Obtener estadísticas básicas de registros manuales
    const estadisticasBasicas = await obtenerEstadisticasColaborador(userId, colaboradorUserId);
    
    // Obtener datos automáticos de cobros usando la función corregida
    try {
      const integracionService = require('./integracionGestionService');
      const resumenCobros = await integracionService.obtenerResumenCobrosColaboradorCorregido(
        colaboradorUserId
      );
      
      console.log(`📊 Datos de cobros para ${colaboradorUserId}:`, {
        ventas: resumenCobros.totalVentas,
        cobros: resumenCobros.totalCobros,
        faltantes: resumenCobros.totalFaltantes,
        gastos: resumenCobros.totalGastosImprevistos
      });
      
      return {
        ...estadisticasBasicas,
        cobrosAutomaticos: {
          totalVentas: resumenCobros.totalVentas,
          totalCobros: resumenCobros.totalCobros,
          faltantesPendientes: resumenCobros.totalFaltantes,
          gastosPendientes: resumenCobros.totalGastosImprevistos,
          mensaje: resumenCobros.mensaje
        },
        totalFaltantesConCobros: estadisticasBasicas.totalFaltantes + resumenCobros.totalFaltantes,
        totalGastosConCobros: estadisticasBasicas.totalGastos + resumenCobros.totalGastosImprevistos,
        // FÓRMULA SIMPLIFICADA (igual que el calendario): pagos diarios - faltantes de cobros - adelantos
        // NO incluimos gastos en el cálculo total a pagar
        totalAPagarConCobros: estadisticasBasicas.totalPagosDiarios - 
          (resumenCobros.totalFaltantes + estadisticasBasicas.totalAdelantos)
      };
      
    } catch (cobroError) {
      console.warn(`⚠️ No se pudieron obtener datos automáticos de cobros para ${colaboradorUserId}:`, cobroError.message);
      return {
        ...estadisticasBasicas,
        cobrosAutomaticos: null,
        advertencia: 'No se pudieron obtener datos automáticos de cobros'
      };
    }
    
  } catch (error) {
    throw new Error('Error al calcular estadísticas mejoradas: ' + error.message);
  }
};

// Actualizar registro existente
const actualizarRegistro = async (userId, registroId, datosActualizados) => {
  try {
    const registro = await GestionPersonal.findOne({ _id: registroId, userId });
    
    if (!registro) {
      throw new Error('Registro no encontrado');
    }

    // Validar colaborador si se está cambiando
    if (datosActualizados.colaboradorUserId && datosActualizados.colaboradorUserId !== registro.colaboradorUserId) {
      const colaborador = await User.findOne({
        clerk_id: datosActualizados.colaboradorUserId,
        role: { $ne: 'super_admin' },
        is_active: true
      });
      
      if (!colaborador) {
        throw new Error('Colaborador no encontrado');
      }
    }

    // Actualizar campos
    const camposPermitidos = ['fechaDeGestion', 'descripcion', 'monto', 'faltante', 'adelanto', 'pagodiario', 'diasLaborados'];
    camposPermitidos.forEach(campo => {
      if (datosActualizados[campo] !== undefined) {
        if (campo === 'fechaDeGestion') {
          registro[campo] = convertirFechaALocalUtc(datosActualizados[campo]);
        } else if (['monto', 'faltante', 'adelanto', 'pagodiario'].includes(campo)) {
          registro[campo] = parsearNumero(datosActualizados[campo]);
        } else if (campo === 'diasLaborados') {
          registro[campo] = parseInt(datosActualizados[campo]) || 1;
        } else {
          registro[campo] = datosActualizados[campo];
        }
      }
    });

    await registro.save();
    return registro;
  } catch (error) {
    throw new Error('Error al actualizar registro: ' + error.message);
  }
};

module.exports = {
  crearRegistro,
  obtenerRegistrosPorColaborador,
  obtenerEstadisticasColaborador,
  obtenerEstadisticasColaboradorConCobros,
  actualizarRegistro
};

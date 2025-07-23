// Función para obtener la fecha y hora actual en formato ISO (Zona horaria Perú UTC-5)
const getFechaHoraActual = () => {
    const now = new Date();
    // Ajustar a zona horaria de Perú (UTC-5)
    const peruTime = new Date(now.getTime() - (5 * 60 * 60 * 1000));
    return peruTime.toISOString();
};

// Función para obtener la fecha actual en formato ISO (solo fecha)
const obtenerFechaActual = () => {
    const now = new Date();
    return now.toISOString().split('T')[0];
};

// Función para convertir fecha a fecha local
const convertirFechaAFechaLocal = (fecha) => {
    if (!fecha) return null;
    const fechaObj = new Date(fecha);
    return fechaObj.toISOString().split('T')[0];
};

// Función para convertir fecha a UTC local
const convertirFechaALocalUtc = (fecha) => {
    if (!fecha) return null;
    const fechaObj = new Date(fecha);
    return fechaObj.toISOString();
};

// Función para validar formato de fecha
const validarFormatoFecha = (fecha) => {
    if (!fecha) return false;
    const fechaObj = new Date(fecha);
    return fechaObj instanceof Date && !isNaN(fechaObj);
};

// Función para formatear fecha para mostrar (Zona horaria Perú)
const formatearFecha = (fecha) => {
    if (!fecha) return '';
    try {
        const fechaObj = new Date(fecha);
        
        // No ajustar manualmente, usar directamente timeZone para mostrar correctamente
        return fechaObj.toLocaleString('es-PE', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            timeZone: 'America/Lima'
        });
    } catch (error) {
        console.error('Error al formatear fecha:', error);
        return 'Fecha inválida';
    }
};

// Función para obtener el principio del día (00:00:00)
const getInicioDia = (fecha) => {
    const fechaObj = new Date(fecha);
    fechaObj.setHours(0, 0, 0, 0);
    return fechaObj;
};

// Función para obtener el final del día (23:59:59)
const getFinDia = (fecha) => {
    const fechaObj = new Date(fecha);
    fechaObj.setHours(23, 59, 59, 999);
    return fechaObj;
};

// Función para convertir fecha del frontend a hora de Perú
const convertirFechaFrontendAPeruUTC = (fechaFrontend) => {
    if (!fechaFrontend) return null;
    
    try {
        // Si viene como string datetime-local (YYYY-MM-DDTHH:mm o YYYY-MM-DDTHH:mm:ss)
        if (typeof fechaFrontend === 'string' && fechaFrontend.includes('T') && !fechaFrontend.includes('Z')) {
            // Interpretar como hora local de Perú y convertir a UTC
            // Agregar offset de Perú (-05:00) para que se interprete correctamente
            let fechaConOffset;
            
            if (fechaFrontend.includes(':') && fechaFrontend.split(':').length === 3) {
                // Ya tiene segundos: YYYY-MM-DDTHH:mm:ss
                fechaConOffset = fechaFrontend + '-05:00';
            } else {
                // Solo tiene horas y minutos: YYYY-MM-DDTHH:mm
                fechaConOffset = fechaFrontend + ':00-05:00';
            }
            
            const fechaObj = new Date(fechaConOffset);
            
            console.log('🔄 Conversión Frontend->Backend:', {
                fechaOriginal: fechaFrontend,
                fechaConOffset: fechaConOffset,
                fechaResultadoUTC: fechaObj.toISOString(),
                fechaDisplayPerú: fechaObj.toLocaleString('es-PE', { timeZone: 'America/Lima' })
            });
            
            if (isNaN(fechaObj.getTime())) {
                throw new Error('Fecha inválida después de agregar offset');
            }
            
            return fechaObj.toISOString();
        } else {
            // Ya es una fecha ISO completa o Date object
            const fechaObj = new Date(fechaFrontend);
            
            if (isNaN(fechaObj.getTime())) {
                throw new Error('Fecha inválida');
            }
            
            return fechaObj.toISOString();
        }
    } catch (error) {
        console.error('Error al convertir fecha frontend a Perú UTC:', error);
        return null;
    }
};

module.exports = {
    getFechaHoraActual,
    obtenerFechaActual,
    convertirFechaAFechaLocal,
    convertirFechaALocalUtc,
    validarFormatoFecha,
    formatearFecha,
    getInicioDia,
    getFinDia,
    convertirFechaFrontendAPeruUTC
};

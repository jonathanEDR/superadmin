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
        // Ajustar a zona horaria de Perú para mostrar
        const peruTime = new Date(fechaObj.getTime() - (5 * 60 * 60 * 1000));
        return peruTime.toLocaleString('es-PE', {
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
        // Si viene como string datetime-local (YYYY-MM-DDTHH:mm)
        let fechaObj;
        
        if (typeof fechaFrontend === 'string' && fechaFrontend.includes('T') && !fechaFrontend.includes('Z')) {
            // Es datetime-local, interpretarlo como hora de Perú
            fechaObj = new Date(fechaFrontend + ':00.000-05:00');
        } else {
            // Ya es una fecha ISO completa
            fechaObj = new Date(fechaFrontend);
        }
        
        if (isNaN(fechaObj.getTime())) {
            throw new Error('Fecha inválida');
        }
        
        return fechaObj.toISOString();
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

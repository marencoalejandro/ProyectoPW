import api from "./axios";
import { toast } from 'react-hot-toast';


const cache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos
let cacheGeneration = 0;

// Sin argumento vacía toda la caché (cambio de sesión) e invalida las
// peticiones GET que aún estén en curso para que no la vuelvan a llenar.
export const clearCache = (endpoint) => {
    if (endpoint) {
        cache.delete(endpoint);
        return;
    }
    cache.clear();
    cacheGeneration += 1;
};

// -------- GET --------
export const getData = async (endpoint, useCache = true, showError = true) => {
    if (useCache && cache.has(endpoint)) {
        const cachedData = cache.get(endpoint);
        if (Date.now() - cachedData.timestamp < CACHE_DURATION) {
            return cachedData.data;
        }
    }

    const generation = cacheGeneration;

    try {
        const response = await api.get(endpoint);

        if (useCache && generation === cacheGeneration) {
            cache.set(endpoint, {
                data: response,
                timestamp: Date.now()
            });
        }

        return response;
    } catch (error) {
        console.error("Error en GET:", error.message || error);
        if (showError) {
            toast.error(`Error al obtener datos: ${error.message || 'Error desconocido'}`);
        }
        throw error;
    }
};

// -------- POST --------
export const postData = async (endpoint, data) => {
    try {
        const response = await api.post(endpoint, data);
        //clearCache(endpoint);
        return response;
    } catch (error) {
        console.error("Error en POST:", error.message || error);
        toast.error(`Error al procesar solicitud: ${error.message || 'Error desconocido'}`);
        throw error;
    }
};

// -------- PATCH --------
export const putData = async (endpoint, data) => {
    try {
        const response = await api.put(endpoint, data);
        //clearCache(endpoint);
        return response;
    } catch (error) {
        console.error("Error en PUT:", error.message || error);
        toast.error(`Error al procesar solicitud: ${error.message || 'Error desconocido'}`);
        throw error;
    }
};
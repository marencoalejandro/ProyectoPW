import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import * as authApi from '../api/authApi';
import { invalidateSession, setUnauthorizedHandler } from '../api/axios';
import { clearCache } from '../api/methods';

const AuthContext = createContext(null);

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth debe usarse dentro de AuthProvider');
    }
    return context;
};

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [restoreError, setRestoreError] = useState(null);
    // Por qué terminó la sesión: 'logout' | 'expired' | null
    const [sessionEnd, setSessionEnd] = useState(null);

    // Cada cambio de sesión incrementa la época; una respuesta que llega con
    // otra época se descarta (StrictMode, logout, login de otro usuario).
    const epochRef = useRef(0);
    const userRef = useRef(null);
    const restoreRef = useRef(null);
    const logoutRef = useRef(null);

    const applyUser = useCallback((next) => {
        userRef.current = next;
        setUser(next);
    }, []);

    const endSession = useCallback((reason) => {
        epochRef.current += 1;
        restoreRef.current?.abort();
        invalidateSession();
        clearCache();
        applyUser(null);
        setRestoreError(null);
        setSessionEnd(reason);
        setIsLoading(false);
    }, [applyUser]);

    const restoreSession = useCallback(async () => {
        restoreRef.current?.abort();
        const controller = new AbortController();
        restoreRef.current = controller;
        const epoch = ++epochRef.current;

        try {
            const profile = await authApi.fetchMe(controller.signal);
            if (epochRef.current !== epoch) return;
            applyUser(profile);
        } catch (error) {
            if (epochRef.current !== epoch || authApi.isCanceled(error)) return;
            applyUser(null);
            if (!authApi.isUnauthorized(error)) {
                setRestoreError(
                    authApi.getErrorMessage(error, 'No se pudo verificar la sesión.'),
                );
            }
        } finally {
            if (epochRef.current === epoch) setIsLoading(false);
        }
    }, [applyUser]);

    useEffect(() => {
        restoreSession();
        return () => restoreRef.current?.abort();
    }, [restoreSession]);

    // Un 401 en cualquier petición privada indica sesión vencida.
    useEffect(() => {
        setUnauthorizedHandler(() => {
            if (userRef.current) endSession('expired');
        });
        return () => setUnauthorizedHandler(null);
    }, [endSession]);

    const retrySession = useCallback(() => {
        setRestoreError(null);
        setIsLoading(true);
        return restoreSession();
    }, [restoreSession]);

    const login = useCallback(async (email, password, remember = false) => {
        const epoch = ++epochRef.current;
        restoreRef.current?.abort();
        setIsLoading(false);
        invalidateSession();
        clearCache();

        try {
            const profile = await authApi.login({ email, password, remember });
            if (epochRef.current !== epoch) {
                return { success: false, error: 'La sesión cambió. Intentá de nuevo.' };
            }
            // La sesión del servidor cambió: token CSRF y caché se renuevan.
            invalidateSession();
            clearCache();
            applyUser(profile);
            setRestoreError(null);
            setSessionEnd(null);
            return { success: true };
        } catch (error) {
            return {
                success: false,
                error: authApi.getErrorMessage(error, 'Revisá tus credenciales.'),
            };
        }
    }, [applyUser]);

    const logout = useCallback(() => {
        if (logoutRef.current) return logoutRef.current;

        const run = async () => {
            try {
                await authApi.logout();
                endSession('logout');
                return { success: true };
            } catch (error) {
                if (authApi.isUnauthorized(error)) {
                    endSession('logout');
                    return { success: true };
                }
                return {
                    success: false,
                    error: 'No se pudo confirmar el cierre de sesión. Intentá de nuevo.',
                };
            } finally {
                logoutRef.current = null;
            }
        };

        logoutRef.current = run();
        return logoutRef.current;
    }, [endSession]);

    const value = useMemo(() => ({
        user,
        isAuthenticated: user !== null,
        isLoading,
        restoreError,
        sessionEnd,
        login,
        logout,
        retrySession,
    }), [user, isLoading, restoreError, sessionEnd, login, logout, retrySession]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};
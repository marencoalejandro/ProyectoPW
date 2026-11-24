import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import Button from "../components/ui/Button";

export default function ProtectedRoute({ loginPath = "/login" }) {
    const { isAuthenticated, isLoading, restoreError, retrySession, sessionEnd } = useAuth();
    const location = useLocation();

    if (isLoading) {
        return (
            <main className="grid min-h-dvh place-items-center bg-canvas p-4 text-primary">
                <p role="status" className="os-help">
                    Verificando sesión…
                </p>
            </main>
        );
    }

    if (restoreError) {
        return (
            <main className="grid min-h-dvh place-items-center bg-canvas p-4 text-primary">
                <div className="os-card os-stack w-full max-w-sm">
                    <h1 className="os-heading">No se pudo verificar la sesión</h1>
                    <p role="alert" className="os-alert os-error">
                        {restoreError}
                    </p>
                    <Button variant="primary" onClick={retrySession}>
                        Reintentar
                    </Button>
                </div>
            </main>
        );
    }

    if (!isAuthenticated) {
        // Tras un cierre de sesión voluntario no se conserva la ruta anterior,
        // para que otro usuario no aterrice en la pantalla del anterior.
        const from =
            sessionEnd === "logout"
                ? null
                : `${location.pathname}${location.search}${location.hash}`;
        return <Navigate to={loginPath} replace state={from ? { from } : null} />;
    }

    return <Outlet />;
}
import { useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import TextInput from "../../components/ui/TextInput";
import PasswordInput from "../../components/ui/PasswordInput";
import Button from "../../components/ui/Button";
import { canOpenPath, homePathFor } from "../../auth/access";

const LOGIN_PATH = "/login";

// Solo se acepta una ruta interna, distinta del login y permitida para el rol
// del usuario; si no, se va a su pantalla de inicio (EMPLEADO → Caja).
function getSafeRedirect(from, user) {
    const home = homePathFor(user);
    if (typeof from !== "string") return home;
    try {
        const url = new URL(from, window.location.origin);
        if (url.origin !== window.location.origin) return home;
        if (url.pathname.startsWith(LOGIN_PATH)) return home;
        if (!canOpenPath(user, url.pathname)) return home;
        return `${url.pathname}${url.search}${url.hash}`;
    } catch {
        return home;
    }
}

export default function Login() {
    const { login, isAuthenticated, user } = useAuth();
    const location = useLocation();
    const [pending, setPending] = useState(false);
    const [error, setError] = useState("");

    async function handleSubmit(event) {
        event.preventDefault();
        if (pending) return;
        const data = new FormData(event.currentTarget);
        setError("");
        setPending(true);
        try {
            const result = await login(data.get("email").trim(), data.get("password"));
            if (!result.success) setError(result.error || "Revisá tus credenciales.");
        } catch {
            setError("No se pudo iniciar sesión. Intentá de nuevo.");
        } finally {
            setPending(false);
        }
    }

    if (isAuthenticated) {
        return <Navigate to={getSafeRedirect(location.state?.from, user)} replace />;
    }

    return (
        <main className="grid min-h-dvh grid-rows-[1fr_auto] bg-canvas p-4 text-primary">
            <div className="flex items-center justify-center">
                <div className="w-full max-w-sm">
                    <div className="mb-6 flex items-center gap-3">
                        <span
                            aria-hidden="true"
                            className="flex h-10 w-10 items-center justify-center rounded-(--radius-control) bg-primary text-lg font-bold text-canvas"
                        >
                            O
                        </span>
                        <p className="text-lg font-bold leading-tight">Orígenes SV</p>
                    </div>

                    <form
                        className="os-card os-form gap-5 bg-white/40 p-6"
                        onSubmit={handleSubmit}
                    >
                        <div className="os-stack">
                            <h1 className="os-title">Iniciar sesión</h1>
                            <p className="os-help">
                                Ingresá con tu correo y contraseña para acceder al sistema.
                            </p>
                        </div>

                        <TextInput
                            label="Correo electrónico"
                            name="email"
                            type="email"
                            autoComplete="username"
                            placeholder="usuario@empresa.com"
                            className="os-input"
                            required
                        />

                        <PasswordInput
                            label="Contraseña"
                            name="password"
                            autoComplete="current-password"
                            className="os-input"
                            required
                        />

                        {error && (
                            <p role="alert" className="os-alert os-error">
                                {error}
                            </p>
                        )}

                        <Button
                            type="submit"
                            variant="primary"
                            className="w-full"
                            disabled={pending}
                        >
                            {pending ? "Ingresando…" : "Iniciar sesión"}
                        </Button>
                    </form>
                </div>
            </div>

            <p className="os-help pt-6 text-center">
                Acceso exclusivo para personal autorizado.
            </p>
        </main>
    );
}
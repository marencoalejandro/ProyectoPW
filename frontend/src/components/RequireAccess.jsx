import { Link, Outlet } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { canAccess, homePathFor } from "../auth/access";

// Va dentro de ProtectedRoute: la sesión ya está restaurada cuando se evalúa.
// Si el rol no tiene acceso, la pantalla pedida no se monta (ni pide datos).
export default function RequireAccess({ section, children }) {
  const { user } = useAuth();

  if (!canAccess(user, section)) return <Forbidden home={homePathFor(user)} />;
  return children ?? <Outlet />;
}

export function Forbidden({ home }) {
  return (
    <section className="mx-auto grid max-w-lg gap-4 py-10 text-center" aria-labelledby="forbidden-title">
      <ShieldAlert size={40} className="mx-auto text-primary" aria-hidden="true" />
      <h2 id="forbidden-title" className="os-title">No tenés acceso a esta sección</h2>
      <p className="text-slate-600">
        Tu rol no permite abrir esta pantalla. Si creés que es un error, consultá con la administración.
      </p>
      {home && home !== "/sin-acceso" && (
        <Link to={home} className="os-btn os-btn--primary mx-auto inline-flex items-center">
          Ir a mi inicio
        </Link>
      )}
    </section>
  );
}

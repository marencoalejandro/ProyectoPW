import { useState } from "react";
import { toast } from "react-hot-toast";
import { Plus, UsersRound } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { can, isAdminCentral, ROLE_LABELS, ROLES } from "../../auth/access";
import { useResource } from "../../hooks/useResource";
import { actualizarEmpleado, CARGOS, crearEmpleado, listarEmpleados, ROLES_ACCESO } from "../../api/rrhhApi";
import { PageHeader, Badge, TableScroll } from "../../components/ui/PageHeader";
import BranchSelect from "../../components/ui/BranchSelect";
import { useSucursales } from "../../hooks/useSucursales";
import { Alert, EmptyState, ErrorState, Loading } from "../../components/ui/Feedback";
import { ConfirmDialog, Modal } from "../../components/ui/Modal";
import { SelectField, TextField } from "../../components/ui/Field";
import { PasswordField } from "../../components/ui/PasswordInput";
import Button from "../../components/ui/Button";
import DataTable from "../../components/ui/DataTable";
import FormActions from "../../components/ui/FormActions";
import { InlineSelect } from "../../components/ui/Select";
import { apiMessage, fieldErrors } from "../../lib/apiError";
import { formatMoney, isValidAmount } from "../../lib/money";
import { focusFirstInvalid } from "../../lib/forms";

export default function EmpleadosPage() {
  const { user } = useAuth();
  const canManage = can(user, "gestionarPersonal");
  const seesAll = user.role === ROLES.RRHH || isAdminCentral(user);
  const [filters, setFilters] = useState({ sucursalId: null, cargo: "", incluirInactivos: false });
  const [editing, setEditing] = useState(null);
  const [deactivating, setDeactivating] = useState(null);
  const [busy, setBusy] = useState(false);

  const empleados = useResource(
    (signal) =>
      listarEmpleados(
        {
          sucursalId: seesAll ? filters.sucursalId : undefined,
          cargo: filters.cargo,
          incluirInactivos: filters.incluirInactivos ? "true" : undefined,
        },
        { signal },
      ),
    `empleados-${filters.sucursalId}-${filters.cargo}-${filters.incluirInactivos}`,
  );

  async function toggleActive() {
    if (busy) return;
    setBusy(true);
    try {
      await actualizarEmpleado(deactivating.id, { activo: !deactivating.activo });
      toast.success(deactivating.activo ? "Empleado dado de baja. Sus sesiones se cerraron." : "Empleado reactivado.");
      setDeactivating(null);
      empleados.reload();
    } catch (err) {
      toast.error(apiMessage(err, "No se pudo actualizar el empleado."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Empleados"
        description={canManage ? "Personal de todas las sucursales y su acceso al sistema." : "Personal de tu sucursal (solo consulta)."}
        actions={
          canManage && (
            <Button variant="primary" className="inline-flex items-center gap-2" onClick={() => setEditing("nuevo")}>
              <Plus size={18} aria-hidden="true" /> Nuevo empleado
            </Button>
          )
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        {seesAll && <BranchSelect value={filters.sucursalId} onChange={(v) => setFilters({ ...filters, sucursalId: v })} />}
        <InlineSelect label="Cargo" value={filters.cargo} onChange={(e) => setFilters({ ...filters, cargo: e.target.value })}>
          <option value="">Todos</option>
          {CARGOS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </InlineSelect>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            className="size-5"
            checked={filters.incluirInactivos}
            onChange={(e) => setFilters({ ...filters, incluirInactivos: e.target.checked })}
          />
          Incluir dados de baja
        </label>
      </div>

      {empleados.loading && !empleados.data ? (
        <Loading label="Cargando empleados…" />
      ) : empleados.error ? (
        <ErrorState error={empleados.error} onRetry={empleados.reload} />
      ) : !empleados.data?.length ? (
        <EmptyState
          icon={UsersRound}
          title="Sin empleados"
          onClearFilters={
            filters.sucursalId || filters.cargo || filters.incluirInactivos
              ? () => setFilters({ sucursalId: null, cargo: "", incluirInactivos: false })
              : undefined
          }
        >
          No hay empleados con estos filtros.
        </EmptyState>
      ) : (
        <TableScroll label="Empleados">
          <DataTable
            caption="Empleados"
            columns={[
              { key: "nombre", label: "Nombre" },
              { key: "cargo", label: "Cargo" },
              { key: "rol", label: "Rol de acceso" },
              { key: "sucursal", label: "Sucursal" },
              { key: "salario", label: "Salario mensual", numeric: true },
              { key: "estado", label: "Estado" },
              canManage && { key: "acciones", label: "Acciones", srOnly: true },
            ]}
          >
            {empleados.data.map((e) => (
              <tr key={e.id}>
                <th scope="row">
                  <span className="block font-semibold">{e.nombre}</span>
                  <span className="block text-xs font-normal text-slate-600">{e.email}</span>
                </th>
                <td>{e.cargo}</td>
                <td>{ROLE_LABELS[e.rol] ?? e.rol}</td>
                <td>{e.sucursal ?? "Central"}</td>
                <td className="os-number">{formatMoney(e.salarioBase)}</td>
                <td>{e.activo ? <Badge tone="ok">Activo</Badge> : <Badge tone="muted">Baja</Badge>}</td>
                {canManage && (
                  <td className="whitespace-nowrap">
                    <Button variant="link" className="mr-3 text-sm" onClick={() => setEditing(e)}>Editar</Button>
                    {e.id !== user.id && (
                      <Button variant="link" className="text-sm" onClick={() => setDeactivating(e)}>
                        {e.activo ? "Dar de baja" : "Reactivar"}
                      </Button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </DataTable>
        </TableScroll>
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "nuevo" ? "Nuevo empleado" : "Editar empleado"} size="lg">
        {editing !== null && (
          <EmpleadoForm
            empleado={editing === "nuevo" ? null : editing}
            onDone={() => {
              setEditing(null);
              empleados.reload();
            }}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deactivating)}
        title={deactivating?.activo ? "Dar de baja" : "Reactivar"}
        confirmLabel={deactivating?.activo ? "Dar de baja" : "Reactivar"}
        danger={deactivating?.activo}
        busy={busy}
        onConfirm={toggleActive}
        onClose={() => setDeactivating(null)}
      >
        {deactivating?.activo
          ? `${deactivating.nombre} perderá el acceso de inmediato y no entrará en las próximas planillas.`
          : `${deactivating?.nombre} podrá volver a iniciar sesión.`}
      </ConfirmDialog>
    </>
  );
}

function EmpleadoForm({ empleado, onDone, onCancel }) {
  const isNew = !empleado;
  const sucursales = useSucursales();
  const [form, setForm] = useState({
    nombre: empleado?.nombre ?? "",
    email: empleado?.email ?? "",
    password: "",
    rol: empleado?.rol ?? "EMPLEADO",
    cargo: empleado?.cargo ?? "CAJERO",
    salarioBase: empleado?.salarioBase ?? "",
    sucursalId: empleado ? (empleado.sucursalId === null ? "" : String(empleado.sucursalId)) : "",
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  function validate() {
    const next = {};
    if (!form.nombre.trim()) next.nombre = "Ingresá el nombre.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) next.email = "Correo inválido.";
    if (isNew || form.password) {
      if (form.password.length < 8 || !/[A-Za-z]/.test(form.password) || !/\d/.test(form.password)) {
        next.password = "Mínimo 8 caracteres, con letras y números.";
      }
    }
    if (!isValidAmount(form.salarioBase) || Number(form.salarioBase) <= 0) next.salarioBase = "Salario inválido.";
    if (form.rol !== "ADMIN" && !form.sucursalId) next.sucursalId = "Elegí la sucursal.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (busy) return;
    if (!validate()) {
      focusFirstInvalid(event.currentTarget);
      return;
    }
    setBusy(true);
    setFormError("");
    const body = {
      nombre: form.nombre.trim(),
      email: form.email.trim(),
      rol: form.rol,
      cargo: form.cargo,
      salarioBase: String(form.salarioBase).trim(),
      sucursalId: form.sucursalId ? Number(form.sucursalId) : null,
    };
    if (form.password) body.password = form.password;
    // En la edición solo viajan los campos que cambiaron: Express cierra las
    // sesiones del empleado cuando cambia su acceso.
    const changes = isNew
      ? body
      : Object.fromEntries(
          Object.entries(body).filter(([k, v]) => k === "password" || String(v ?? "") !== String(empleado[k] ?? "")),
        );
    if (!isNew && Object.keys(changes).length === 0) {
      onCancel();
      return;
    }
    try {
      if (isNew) await crearEmpleado(body);
      else await actualizarEmpleado(empleado.id, changes);
      toast.success(isNew ? "Empleado registrado." : "Empleado actualizado.");
      onDone();
    } catch (err) {
      setErrors(fieldErrors(err));
      setFormError(apiMessage(err, "No se pudo guardar el empleado."));
    } finally {
      setBusy(false);
    }
  }

  const bind = (name) => ({
    value: form[name],
    onChange: (e) => setForm((prev) => ({ ...prev, [name]: e.target.value })),
    error: errors[name],
  });

  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit} noValidate>
      <TextField label="Nombre completo" required className="sm:col-span-2" {...bind("nombre")} />
      <TextField label="Correo (usuario)" type="email" required autoComplete="off" {...bind("email")} />
      <PasswordField
        toggle
        label={isNew ? "Contraseña inicial" : "Nueva contraseña"}
        autoComplete="new-password"
        required={isNew}
        hint={isNew ? "Mínimo 8 caracteres, con letras y números." : "Dejala vacía para no cambiarla."}
        {...bind("password")}
      />
      <SelectField label="Cargo (puesto)" required {...bind("cargo")}>
        {CARGOS.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </SelectField>
      <SelectField label="Rol de acceso al sistema" required hint="Define qué pantallas puede abrir. EMPLEADO solo accede a Caja." {...bind("rol")}>
        {ROLES_ACCESO.map((r) => (
          <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>
        ))}
      </SelectField>
      <TextField label="Salario base mensual (US$)" required inputMode="decimal" {...bind("salarioBase")} />
      <SelectField
        label="Sucursal"
        required={form.rol !== "ADMIN"}
        hint={form.rol === "ADMIN" ? "Sin sucursal = administración central." : undefined}
        {...bind("sucursalId")}
      >
        <option value="">{form.rol === "ADMIN" ? "Administración central" : "Elegí…"}</option>
        {(sucursales.data ?? []).map((s) => (
          <option key={s.id} value={s.id}>{s.nombre}</option>
        ))}
      </SelectField>
      {!isNew && <p className="os-help text-slate-600 sm:col-span-2">Cambiar rol, sucursal o contraseña cierra las sesiones abiertas del empleado.</p>}
      {formError && <Alert tone="error" className="sm:col-span-2">{formError}</Alert>}
      <FormActions className="flex justify-end gap-2 sm:col-span-2" onCancel={onCancel} busy={busy} />
    </form>
  );
}

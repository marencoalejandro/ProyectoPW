import { useState } from "react";
import { toast } from "react-hot-toast";
import { Plus, Truck } from "lucide-react";
import { useResource } from "../../hooks/useResource";
import { actualizarProveedor, crearProveedor, listarProveedores } from "../../api/comprasApi";
import { PageHeader, TableScroll } from "../../components/ui/PageHeader";
import { Alert, EmptyState, ErrorState, Loading } from "../../components/ui/Feedback";
import { Modal } from "../../components/ui/Modal";
import { TextField } from "../../components/ui/Field";
import Button from "../../components/ui/Button";
import DataTable from "../../components/ui/DataTable";
import FormActions from "../../components/ui/FormActions";
import MaskedInput from "../../components/ui/MaskedInput";
import { apiMessage, fieldErrors } from "../../lib/apiError";
import { focusFirstInvalid } from "../../lib/forms";
import { formatMasked, maskDigits } from "../../lib/masks";

export default function ProveedoresPage() {
  const [editing, setEditing] = useState(null); // proveedor | "nuevo"
  const proveedores = useResource((signal) => listarProveedores({ signal }), "proveedores");

  return (
    <>
      <PageHeader
        title="Proveedores"
        description="Empresas que abastecen las sucursales."
        actions={
          <Button variant="primary" className="inline-flex items-center gap-2" onClick={() => setEditing("nuevo")}>
            <Plus size={18} aria-hidden="true" /> Nuevo proveedor
          </Button>
        }
      />

      {proveedores.loading && !proveedores.data ? (
        <Loading label="Cargando proveedores…" />
      ) : proveedores.error ? (
        <ErrorState error={proveedores.error} onRetry={proveedores.reload} />
      ) : !proveedores.data?.length ? (
        <EmptyState icon={Truck} title="Sin proveedores">Registrá el primero para cargar compras.</EmptyState>
      ) : (
        <TableScroll label="Proveedores">
          <DataTable
            caption="Proveedores"
            columns={[
              { key: "nombre", label: "Nombre" },
              { key: "nit", label: "NIT" },
              { key: "acciones", label: "Acciones", srOnly: true },
            ]}
          >
            {proveedores.data.map((p) => (
              <tr key={p.id}>
                <th scope="row" className="font-semibold">{p.nombre}</th>
                <td>{p.nit ? formatMasked("nit", p.nit) : "Sin datos"}</td>
                <td>
                  <Button variant="link" className="text-sm" onClick={() => setEditing(p)}>Editar</Button>
                </td>
              </tr>
            ))}
          </DataTable>
        </TableScroll>
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "nuevo" ? "Nuevo proveedor" : "Editar proveedor"} size="sm">
        {editing !== null && (
          <ProveedorForm
            proveedor={editing === "nuevo" ? null : editing}
            onDone={() => {
              setEditing(null);
              proveedores.reload();
            }}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>
    </>
  );
}

function ProveedorForm({ proveedor, onDone, onCancel }) {
  // `nit` son solo dígitos (MaskedInput); se aceptan valores guardados con guiones.
  const [form, setForm] = useState({ nombre: proveedor?.nombre ?? "", nit: maskDigits("nit", proveedor?.nit) });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (busy) return;
    const nextErrors = {};
    if (!form.nombre.trim()) nextErrors.nombre = "Ingresá el nombre.";
    if (form.nit && !/^(\d{9}|\d{14})$/.test(form.nit)) nextErrors.nit = "El NIT debe tener 9 o 14 dígitos.";
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      focusFirstInvalid(event.currentTarget);
      return;
    }
    setBusy(true);
    setErrors({});
    setFormError("");
    const body = { nombre: form.nombre.trim(), nit: form.nit || null };
    try {
      if (proveedor) await actualizarProveedor(proveedor.id, body);
      else await crearProveedor(body);
      toast.success(proveedor ? "Proveedor actualizado." : "Proveedor registrado.");
      onDone();
    } catch (err) {
      setErrors(fieldErrors(err));
      setFormError(apiMessage(err, "No se pudo guardar el proveedor."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit} noValidate>
      <TextField label="Nombre" required value={form.nombre} error={errors.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
      <MaskedInput mask="nit" label="NIT" value={form.nit} error={errors.nit} hint="Opcional; 9 o 14 dígitos." onValueChange={(nit) => setForm({ ...form, nit })} />
      {formError && <Alert tone="error">{formError}</Alert>}
      <FormActions onCancel={onCancel} busy={busy} />
    </form>
  );
}

import { useState } from "react";
import { toast } from "react-hot-toast";
import { CookingPot, Plus } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { can } from "../../auth/access";
import { useResource } from "../../hooks/useResource";
import {
  actualizarPlatillo,
  crearInsumo,
  crearPlatillo,
  getPlatillo,
  listarInsumos,
  listarPlatillos,
  reemplazarReceta,
} from "../../api/catalogoApi";
import { PageHeader, Badge, TableScroll } from "../../components/ui/PageHeader";
import { Alert, EmptyState, ErrorState, Loading } from "../../components/ui/Feedback";
import { Modal } from "../../components/ui/Modal";
import { SelectField, TextField } from "../../components/ui/Field";
import Button from "../../components/ui/Button";
import DataTable from "../../components/ui/DataTable";
import FormActions from "../../components/ui/FormActions";
import RemoveRowButton from "../../components/ui/RemoveRowButton";
import { apiMessage, fieldErrors } from "../../lib/apiError";
import { formatQuantity } from "../../lib/format";
import { formatMoney, isValidAmount } from "../../lib/money";
import { focusFirstInvalid } from "../../lib/forms";

export default function MenuPage() {
  const { user } = useAuth();
  const canEdit = can(user, "editarCatalogo");
  const [selected, setSelected] = useState(null); // id | "nuevo"
  const [newInsumo, setNewInsumo] = useState(false);

  const platillos = useResource(
    (signal) => listarPlatillos({ incluirInactivos: canEdit ? "true" : undefined }, { signal }),
    "menu-admin",
  );

  const grouped = Object.entries(
    (platillos.data ?? []).reduce((acc, p) => {
      const key = p.categoria ?? "Sin categoría";
      (acc[key] ??= []).push(p);
      return acc;
    }, {}),
  ).sort(([a], [b]) => a.localeCompare(b));

  return (
    <>
      <PageHeader
        title="Menú y recetas"
        description={
          canEdit
            ? "Productos a la venta y los insumos que descuenta cada uno. Los precios incluyen IVA."
            : "Consulta del menú y sus recetas. Solo la administración central modifica el catálogo."
        }
        actions={
          canEdit && (
            <>
              <Button onClick={() => setNewInsumo(true)}>
                Nuevo insumo
              </Button>
              <Button variant="primary" className="inline-flex items-center gap-2" onClick={() => setSelected("nuevo")}>
                <Plus size={18} aria-hidden="true" /> Nuevo producto
              </Button>
            </>
          )
        }
      />

      {platillos.loading && !platillos.data ? (
        <Loading label="Cargando menú…" />
      ) : platillos.error ? (
        <ErrorState error={platillos.error} onRetry={platillos.reload} />
      ) : grouped.length === 0 ? (
        <EmptyState icon={CookingPot} title="El menú está vacío" />
      ) : (
        <div className="grid gap-6">
          {grouped.map(([categoria, items]) => (
            <section key={categoria}>
              <h3 className="os-heading mb-2">{categoria}</h3>
              <TableScroll label={`Productos de ${categoria}`}>
                <DataTable
                  columns={[
                    { key: "producto", label: "Producto" },
                    { key: "tipo", label: "Tipo" },
                    { key: "precio", label: "Precio", numeric: true },
                    { key: "estado", label: "Estado" },
                    { key: "acciones", label: "Acciones", srOnly: true },
                  ]}
                >
                  {items.map((p) => (
                    <tr key={p.id}>
                      <th scope="row" className="font-semibold">{p.nombre}</th>
                      <td>{p.tipo === "REVENTA" ? "Empacado (por unidad)" : "Elaborado (receta)"}</td>
                      <td className="os-number">{formatMoney(p.precio)}</td>
                      <td>{p.activo ? <Badge tone="ok">A la venta</Badge> : <Badge tone="muted">Inactivo</Badge>}</td>
                      <td>
                        <Button variant="link" className="text-sm" onClick={() => setSelected(p.id)}>
                          {canEdit ? "Ver / editar" : "Ver receta"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </DataTable>
              </TableScroll>
            </section>
          ))}
        </div>
      )}

      <Modal
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected === "nuevo" ? "Nuevo producto" : "Producto y receta"}
        size="lg"
      >
        {selected !== null && (
          <PlatilloDetail
            id={selected === "nuevo" ? null : selected}
            canEdit={canEdit}
            onSaved={() => {
              setSelected(null);
              platillos.reload();
            }}
            onCancel={() => setSelected(null)}
          />
        )}
      </Modal>

      <Modal open={newInsumo} onClose={() => setNewInsumo(false)} title="Nuevo insumo" size="sm">
        {newInsumo && <InsumoForm onDone={() => setNewInsumo(false)} />}
      </Modal>
    </>
  );
}

function PlatilloDetail({ id, canEdit, onSaved, onCancel }) {
  const detail = useResource((signal) => getPlatillo(id, { signal }), id ? `platillo-${id}` : null);
  const insumos = useResource((signal) => listarInsumos({}, { signal }), canEdit ? "insumos" : null);

  if (id && detail.loading && !detail.data) return <Loading />;
  if (id && detail.error) return <ErrorState error={detail.error} onRetry={detail.reload} />;

  if (!canEdit) {
    const p = detail.data;
    return (
      <div className="grid gap-3 text-sm">
        <p>
          <strong>{p.nombre}</strong> · {formatMoney(p.precio)} · {p.tipo === "REVENTA" ? "Empacado" : "Elaborado"}
        </p>
        <RecipeTable items={p.receta} />
      </div>
    );
  }

  return (
    <PlatilloForm
      key={id ?? "nuevo"}
      platillo={detail.data ?? null}
      insumos={insumos.data ?? []}
      insumosError={insumos.error}
      onSaved={onSaved}
      onCancel={onCancel}
    />
  );
}

function RecipeTable({ items }) {
  if (!items?.length) return <p className="text-slate-600">Este producto no tiene receta.</p>;
  return (
    <DataTable
      caption="Receta"
      columns={[
        { key: "insumo", label: "Insumo" },
        { key: "cantidad", label: "Cantidad por unidad vendida", numeric: true },
      ]}
    >
      {items.map((r) => (
        <tr key={r.insumoId}>
          <td>{r.nombre}</td>
          <td className="os-number">{formatQuantity(r.cantidad, r.unidad)}</td>
        </tr>
      ))}
    </DataTable>
  );
}

function PlatilloForm({ platillo, insumos, insumosError, onSaved, onCancel }) {
  const isNew = !platillo;
  const [form, setForm] = useState({
    nombre: platillo?.nombre ?? "",
    categoria: platillo?.categoria ?? "",
    precio: platillo?.precio ?? "",
    tipo: platillo?.tipo ?? "ELABORADO",
    activo: platillo?.activo ?? true,
  });
  const [receta, setReceta] = useState(
    (platillo?.receta ?? []).map((r) => ({ insumoId: String(r.insumoId), cantidad: String(Number(r.cantidad)) })),
  );
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  const unitOf = (insumoId) => insumos.find((i) => String(i.id) === insumoId)?.unidad ?? "";

  function validate() {
    const next = {};
    if (!form.nombre.trim()) next.nombre = "Ingresá el nombre.";
    if (!isValidAmount(form.precio)) next.precio = "Precio inválido (hasta 2 decimales).";
    receta.forEach((r, i) => {
      if (!r.insumoId) next[`receta.${i}.insumoId`] = "Elegí el insumo.";
      if (!isValidAmount(r.cantidad, 3) || Number(r.cantidad) <= 0) next[`receta.${i}.cantidad`] = "Cantidad inválida.";
    });
    const ids = receta.map((r) => r.insumoId).filter(Boolean);
    if (new Set(ids).size !== ids.length) next.receta = "Cada insumo puede aparecer una sola vez.";
    if (form.tipo === "REVENTA" && receta.length !== 1) next.receta = "Un producto empacado descuenta un único insumo por unidad.";
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
    const items = receta.map((r) => ({ insumoId: Number(r.insumoId), cantidad: r.cantidad.trim() }));
    const body = {
      nombre: form.nombre.trim(),
      categoria: form.categoria.trim() || null,
      precio: String(form.precio).trim(),
      tipo: form.tipo,
      activo: form.activo,
    };
    try {
      if (isNew) {
        await crearPlatillo({ ...body, receta: items });
      } else {
        await actualizarPlatillo(platillo.id, body);
        await reemplazarReceta(platillo.id, items);
      }
      toast.success(isNew ? "Producto creado." : "Producto actualizado.");
      onSaved();
    } catch (err) {
      setErrors(fieldErrors(err));
      setFormError(apiMessage(err, "No se pudo guardar el producto."));
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
    <form className="grid gap-4" onSubmit={handleSubmit} noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Nombre" required className="sm:col-span-2" {...bind("nombre")} />
        <TextField label="Categoría" {...bind("categoria")} />
        <TextField label="Precio con IVA (US$)" required inputMode="decimal" {...bind("precio")} />
        <SelectField label="Tipo" {...bind("tipo")}>
          <option value="ELABORADO">Elaborado (descuenta receta)</option>
          <option value="REVENTA">Empacado (descuenta 1 unidad)</option>
        </SelectField>
        <label className="flex items-center gap-2 self-end pb-3 text-sm font-semibold">
          <input
            type="checkbox"
            className="size-5"
            checked={form.activo}
            onChange={(e) => setForm((prev) => ({ ...prev, activo: e.target.checked }))}
          />
          A la venta
        </label>
      </div>

      <fieldset className="grid gap-2">
        <legend className="mb-1 font-semibold">Receta (por unidad vendida)</legend>
        {insumosError && <Alert tone="error">No se pudieron cargar los insumos.</Alert>}
        {receta.map((r, i) => (
          <div key={i} className="grid grid-cols-[minmax(0,1fr)_7rem_auto] items-end gap-2">
            <SelectField
              label={`Insumo ${i + 1}`}
              value={r.insumoId}
              error={errors[`receta.${i}.insumoId`]}
              onChange={(e) => setReceta((prev) => prev.map((x, j) => (j === i ? { ...x, insumoId: e.target.value } : x)))}
            >
              <option value="">Elegí…</option>
              {insumos.map((ins) => (
                <option key={ins.id} value={ins.id}>
                  {ins.nombre} ({ins.unidad})
                </option>
              ))}
            </SelectField>
            <TextField
              label={`Cantidad ${unitOf(r.insumoId)}`}
              inputMode="decimal"
              value={r.cantidad}
              error={errors[`receta.${i}.cantidad`]}
              onChange={(e) => setReceta((prev) => prev.map((x, j) => (j === i ? { ...x, cantidad: e.target.value } : x)))}
            />
            <RemoveRowButton
              label={`Quitar insumo ${i + 1}`}
              onClick={() => setReceta((prev) => prev.filter((_, j) => j !== i))}
            />
          </div>
        ))}
        {errors.receta && <p className="os-help font-semibold text-red-800">{errors.receta}</p>}
        <Button
          className="justify-self-start text-sm"
          onClick={() => setReceta((prev) => [...prev, { insumoId: "", cantidad: "" }])}
        >
          Agregar insumo
        </Button>
      </fieldset>

      {formError && <Alert tone="error">{formError}</Alert>}
      <FormActions onCancel={onCancel} busy={busy} />
    </form>
  );
}

function InsumoForm({ onDone }) {
  const [form, setForm] = useState({ nombre: "", unidad: "unidad", stockMinimo: "0" });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (busy) return;
    const next = {};
    if (!form.nombre.trim()) next.nombre = "Ingresá el nombre.";
    if (!isValidAmount(form.stockMinimo, 3)) next.stockMinimo = "Cantidad inválida.";
    setErrors(next);
    if (Object.keys(next).length) {
      focusFirstInvalid(event.currentTarget);
      return;
    }
    setBusy(true);
    setFormError("");
    try {
      await crearInsumo({ nombre: form.nombre.trim(), unidad: form.unidad, stockMinimo: form.stockMinimo.trim() });
      toast.success("Insumo creado con stock 0 en todas las sucursales.");
      onDone();
    } catch (err) {
      setErrors(fieldErrors(err));
      setFormError(apiMessage(err, "No se pudo crear el insumo."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit} noValidate>
      <TextField label="Nombre" required value={form.nombre} error={errors.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
      <SelectField label="Unidad" value={form.unidad} onChange={(e) => setForm({ ...form, unidad: e.target.value })}>
        <option value="unidad">unidad</option>
        <option value="g">gramos (g)</option>
        <option value="ml">mililitros (ml)</option>
      </SelectField>
      <TextField
        label="Stock mínimo inicial"
        inputMode="decimal"
        value={form.stockMinimo}
        error={errors.stockMinimo}
        onChange={(e) => setForm({ ...form, stockMinimo: e.target.value })}
      />
      {formError && <Alert tone="error">{formError}</Alert>}
      <FormActions onCancel={onDone} busy={busy} submitLabel="Crear insumo" />
    </form>
  );
}

import { useEffect, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { Search, UserPlus } from "lucide-react";
import { useResource } from "../../hooks/useResource";
import {
  actualizarCliente,
  buscarClientes,
  crearCliente,
  TAMANOS_CONTRIBUYENTE,
  TIPOS_CONTRIBUYENTE,
} from "../../api/clientesApi";

import { apiMessage, fieldErrors } from "../../lib/apiError";

import { Modal } from "../ui/Modal";
import { SelectField, TextField } from "../ui/Field";
import { Alert, Loading } from "../ui/Feedback";
import Button from "../ui/Button";
import FormActions from "../ui/FormActions";
import MaskedInput from "../ui/MaskedInput";
import { focusFirstInvalid } from "../../lib/forms";
import { maskDigits } from "../../lib/masks";

// Selección de cliente fiscal para CCF: buscar por nombre, NIT o NRC,
// registrar uno nuevo, o completar el NRC si la ficha no lo tiene.
export default function ClienteSelector({ cliente, onChange, nrcRequested = false }) {
  const [term, setTerm] = useState("");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  // Espera 300 ms sin teclear antes de consultar.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(term.trim()), 300);
    return () => clearTimeout(timer);
  }, [term]);

  const results = useResource(
    (signal) => buscarClientes(query, { signal }),
    !cliente && query.length >= 2 ? `clientes-${query}` : null,
  );

  if (cliente) {
    return (
      <div className="grid gap-3 rounded-(--radius-control) border border-secondary bg-white p-3 text-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold">{cliente.nombre}</p>
            <p className="text-slate-600">
              NIT {cliente.nit} · NRC {cliente.nrc ?? <span className="font-semibold text-red-800">sin registrar</span>}
            </p>
          </div>
          <Button className="min-h-10! py-1 text-sm" onClick={() => onChange(null)}>
            Cambiar
          </Button>
        </div>
        {!cliente.nrc && <NrcForm cliente={cliente} onSaved={onChange} highlighted={nrcRequested} />}
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <label className="relative block">
        <span className="os-sr">Buscar cliente por nombre, NIT o NRC</span>
        <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-edge" aria-hidden="true" />
        <input
          type="search"
          className="os-input bg-white pl-9"
          placeholder="Buscar por nombre, NIT o NRC"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          autoComplete="off"
        />
      </label>

      {query.length >= 2 && (
        <div className="max-h-56 overflow-y-auto rounded-(--radius-control) border border-secondary bg-white">
          {results.loading && !results.data ? (
            <Loading label="Buscando…" className="px-3 py-3" />
          ) : results.error ? (
            <p className="px-3 py-3 text-sm text-red-800">{apiMessage(results.error, "No se pudo buscar.")}</p>
          ) : results.data?.length ? (
            <ul>
              {results.data.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="w-full border-b border-secondary px-3 py-2 text-left text-sm last:border-0 hover:bg-canvas"
                    onClick={() => {
                      onChange(c);
                      setTerm("");
                    }}
                  >
                    <span className="block font-semibold">{c.nombre}</span>
                    <span className="block text-xs text-slate-600">
                      NIT {c.nit} · NRC {c.nrc ?? "sin registrar"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-3 text-sm text-slate-600">No hay clientes que coincidan.</p>
          )}
        </div>
      )}

      <Button className="inline-flex items-center justify-center gap-2 text-sm" onClick={() => setCreating(true)}>
        <UserPlus size={16} aria-hidden="true" /> Registrar cliente nuevo
      </Button>

      <Modal open={creating} onClose={() => setCreating(false)} title="Registrar cliente fiscal" size="lg">
        <ClienteForm
          initialNombre={/\d/.test(term) ? "" : term}
          initialNit={/^\d[\d-\s]*$/.test(term) ? maskDigits("nit", term) : ""}
          onCancel={() => setCreating(false)}
          onSaved={(c) => {
            setCreating(false);
            onChange(c);
          }}
        />
      </Modal>
    </div>
  );
}

function NrcForm({ cliente, onSaved, highlighted }) {
  const [nrc, setNrc] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);

  async function save(event) {
    event.preventDefault();
    if (lock.current) return;
    if (!/^\d{1,10}$/.test(nrc)) {
      setError("El NRC debe tener de 1 a 10 dígitos.");
      focusFirstInvalid(event.currentTarget);
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      // `nrc` ya son solo dígitos (MaskedInput).
      const updated = await actualizarCliente(cliente.id, { nrc });
      toast.success("NRC guardado en la ficha del cliente.");
      onSaved(updated);
    } catch (err) {
      setError(fieldErrors(err).nrc ?? apiMessage(err, "No se pudo guardar el NRC."));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className={`grid gap-2 rounded-(--radius-control) p-3 ${highlighted ? "os-error" : "bg-warm/40"}`} noValidate>
      <p className="font-semibold">Para emitir el CCF falta el NRC de este cliente.</p>
      <div className="flex flex-wrap items-end gap-2">
        <MaskedInput
          mask="nrc"
          label="NRC"
          className="min-w-40 flex-1"
          placeholder="1234567"
          value={nrc}
          onValueChange={setNrc}
          error={error}
        />
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "Guardando…" : "Guardar NRC"}
        </Button>
      </div>
    </form>
  );
}

const EMPTY = {
  nombre: "",
  nit: "",
  nrc: "",
  direccion: "",
  giro: "",
  tipo_contribuyente: "juridica",
  tamano_contribuyente: "pequeno",
  correo: "",
  telefono: "",
};

function validateCliente(form) {
  const errors = {};
  if (!form.nombre.trim()) errors.nombre = "Ingresá el nombre o razón social.";
  // NIT, NRC y teléfono se guardan como dígitos (MaskedInput).
  if (!/^(\d{9}|\d{14})$/.test(form.nit)) errors.nit = "El NIT debe tener 9 o 14 dígitos.";
  if (form.nrc && !/^\d{1,10}$/.test(form.nrc)) errors.nrc = "El NRC debe tener de 1 a 10 dígitos.";
  if (!form.direccion.trim()) errors.direccion = "Ingresá la dirección.";
  if (!form.giro.trim()) errors.giro = "Ingresá el giro o actividad.";
  if (form.correo.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.correo.trim())) errors.correo = "Correo inválido.";
  if (form.telefono && !/^\d{8}$/.test(form.telefono)) errors.telefono = "El teléfono debe tener 8 dígitos.";
  return errors;
}

// Alta de cliente con el contrato de la tabla `cliente`. NRC opcional.
export function ClienteForm({ initialNombre = "", initialNit = "", onSaved, onCancel }) {
  const [form, setForm] = useState({ ...EMPTY, nombre: initialNombre, nit: initialNit });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);

  const bind = (name) => ({
    name,
    value: form[name],
    onChange: (e) => setForm((prev) => ({ ...prev, [name]: e.target.value })),
    error: errors[name],
  });
  // Campos con máscara: reciben y devuelven solo dígitos.
  const bindMasked = (name) => ({
    name,
    value: form[name],
    onValueChange: (value) => setForm((prev) => ({ ...prev, [name]: value })),
    error: errors[name],
  });

  async function handleSubmit(event) {
    event.preventDefault();
    if (lock.current) return;
    const nextErrors = validateCliente(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      focusFirstInvalid(event.currentTarget);
      return;
    }
    lock.current = true;
    setBusy(true);
    setFormError("");
    try {
      const cliente = await crearCliente(form);
      toast.success("Cliente registrado.");
      onSaved(cliente);
    } catch (err) {
      setErrors(fieldErrors(err));
      setFormError(apiMessage(err, "No se pudo registrar el cliente."));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit} noValidate>
      <TextField label="Nombre o razón social" required className="sm:col-span-2" autoComplete="organization" {...bind("nombre")} />
      <MaskedInput mask="nit" label="NIT" required hint="9 o 14 dígitos; se aceptan guiones." {...bindMasked("nit")} />
      <MaskedInput mask="nrc" label="NRC" hint="Opcional al guardar; obligatorio para emitir CCF." {...bindMasked("nrc")} />
      <TextField label="Dirección" required className="sm:col-span-2" {...bind("direccion")} />
      <TextField label="Giro o actividad" required className="sm:col-span-2" {...bind("giro")} />
      <SelectField label="Tipo de contribuyente" required {...bind("tipo_contribuyente")}>
        {TIPOS_CONTRIBUYENTE.map((t) => (
          <option key={t.value} value={t.value}>{t.label}</option>
        ))}
      </SelectField>
      <SelectField label="Tamaño de contribuyente" required {...bind("tamano_contribuyente")}>
        {TAMANOS_CONTRIBUYENTE.map((t) => (
          <option key={t.value} value={t.value}>{t.label}</option>
        ))}
      </SelectField>
      <TextField label="Correo" type="email" autoComplete="email" {...bind("correo")} />
      <MaskedInput mask="telefono" label="Teléfono" hint="8 dígitos" {...bindMasked("telefono")} />
      {formError && <Alert tone="error" className="sm:col-span-2">{formError}</Alert>}
      <FormActions
        className="flex flex-wrap justify-end gap-2 sm:col-span-2"
        onCancel={onCancel}
        busy={busy}
        submitLabel="Guardar cliente"
      />
    </form>
  );
}

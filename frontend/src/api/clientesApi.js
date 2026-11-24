import api from "./axios";

// Directorio fiscal (tabla `cliente`) para emitir CCF.
// Entrada en snake_case (tipo_contribuyente, tamano_contribuyente); la
// respuesta llega en camelCase (tipoContribuyente, tamanoContribuyente).

export const TIPOS_CONTRIBUYENTE = Object.freeze([
  { value: "juridica", label: "Persona jurídica" },
  { value: "natural", label: "Persona natural" },
]);

export const TAMANOS_CONTRIBUYENTE = Object.freeze([
  { value: "pequeno", label: "Pequeño" },
  { value: "mediano", label: "Mediano" },
  { value: "grande", label: "Grande" },
]);

/** GET /clientes?buscar= → por nombre, o por prefijo de NIT/NRC si son dígitos. */
export async function buscarClientes(buscar, { signal, limite = 10 } = {}) {
  const { data } = await api.get("/clientes", { params: { buscar, limite }, signal });
  return data?.items ?? [];
}

const nullIfEmpty = (value) => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
};

/** POST /clientes. NRC, correo y teléfono son opcionales (se envían como null). */
export async function crearCliente(form) {
  const { data } = await api.post("/clientes", {
    nombre: form.nombre.trim(),
    nit: form.nit.trim(),
    direccion: form.direccion.trim(),
    giro: form.giro.trim(),
    tipo_contribuyente: form.tipo_contribuyente,
    tamano_contribuyente: form.tamano_contribuyente,
    nrc: nullIfEmpty(form.nrc),
    correo: nullIfEmpty(form.correo),
    telefono: nullIfEmpty(form.telefono),
  });
  return data;
}

/** PUT /clientes/:id con cualquier subconjunto de campos (snake_case). */
export async function actualizarCliente(id, changes) {
  const { data } = await api.put(`/clientes/${id}`, changes);
  return data;
}

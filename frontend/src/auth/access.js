import {
  ChartColumn,
  ClipboardList,
  CookingPot,
  FileText,
  Package,
  ReceiptText,
  ShoppingCart,
  Store,
  Truck,
  UsersRound,
  Wallet,
} from "lucide-react";

// Reglas de acceso del frontend, en un solo lugar. El menú lateral, las rutas
// protegidas y la redirección después del login consultan estas mismas reglas.
//
// Se decide con `user.role` (rol de acceso: ADMIN, RRHH, EMPLEADO), nunca con
// `user.cargo` (puesto laboral: CAJERO, BARISTA, GERENTE, RRHH).
// Express vuelve a validar todo: esto solo evita mostrar lo que no corresponde.

export const ROLES = Object.freeze({
  ADMIN: "ADMIN",
  RRHH: "RRHH",
  EMPLEADO: "EMPLEADO",
});

/** Administración central: rol ADMIN sin sucursal asignada. */
export const isAdminCentral = (user) =>
  user?.role === ROLES.ADMIN && (user.branchId === null || user.branchId === undefined);

const hasRole = (user, ...roles) => Boolean(user?.role) && roles.includes(user.role);

// Cada sección: ruta base, roles con acceso y, si hace falta, una condición
// extra que replica la del backend (p. ej. planilla solo admin central).
export const SECTIONS = Object.freeze({
  caja: {
    path: "/caja",
    label: "Turno de caja",
    icon: Wallet,
    group: "caja",
    roles: [ROLES.EMPLEADO, ROLES.ADMIN],
  },
  pos: {
    path: "/caja/pos",
    label: "Punto de venta",
    icon: ShoppingCart,
    group: "caja",
    roles: [ROLES.EMPLEADO, ROLES.ADMIN],
  },
  comprobantes: {
    path: "/caja/comprobantes",
    label: "Comprobantes",
    icon: ReceiptText,
    group: "caja",
    roles: [ROLES.EMPLEADO, ROLES.ADMIN],
  },
  inventario: {
    path: "/inventario",
    label: "Inventario",
    icon: Package,
    group: "operacion",
    roles: [ROLES.ADMIN],
  },
  menu: {
    path: "/menu",
    label: "Menú y recetas",
    icon: CookingPot,
    group: "operacion",
    roles: [ROLES.ADMIN],
  },
  compras: {
    path: "/compras",
    label: "Compras y CxP",
    icon: ClipboardList,
    group: "operacion",
    roles: [ROLES.ADMIN],
  },
  proveedores: {
    path: "/proveedores",
    label: "Proveedores",
    icon: Truck,
    group: "operacion",
    roles: [ROLES.ADMIN],
  },
  reportes: {
    path: "/reportes",
    label: "Reportes",
    icon: ChartColumn,
    group: "operacion",
    // Express: gerente (su sucursal) y administración central.
    roles: [ROLES.ADMIN],
  },
  empleados: {
    path: "/empleados",
    label: "Empleados",
    icon: UsersRound,
    group: "rrhh",
    roles: [ROLES.ADMIN, ROLES.RRHH],
  },
  planilla: {
    path: "/planilla",
    aliases: ["/nomina"],
    label: "Planilla",
    icon: FileText,
    group: "rrhh",
    roles: [ROLES.RRHH, ROLES.ADMIN],
    // Express: solo RR. HH. y la administración central (un gerente con
    // sucursal recibe 403).
    extra: (user) => user.role === ROLES.RRHH || isAdminCentral(user),
  },
});

export const NAV_GROUPS = Object.freeze([
  { id: "caja", label: "Caja", icon: Store },
  { id: "operacion", label: "Operación" },
  { id: "rrhh", label: "Recursos humanos" },
]);

// Acciones dentro de una pantalla (botones de edición).
export const ACTIONS = Object.freeze({
  // Menú, insumos y recetas: catálogo central.
  editarCatalogo: (user) => isAdminCentral(user),
  // Alta, edición y baja de personal.
  gestionarPersonal: (user) => user?.role === ROLES.RRHH || isAdminCentral(user),
  // Stock mínimo y ajustes manuales por sucursal.
  editarStockMinimo: (user) => hasRole(user, ROLES.ADMIN),
  ajustarStock: (user) => hasRole(user, ROLES.ADMIN),
  // Anular ventas: gerente de la sucursal o administración central (no cajeros).
  anularVenta: (user) => hasRole(user, ROLES.ADMIN),
});

export function canAccess(user, sectionKey) {
  const section = SECTIONS[sectionKey];
  if (!section || !hasRole(user, ...section.roles)) return false;
  return section.extra ? section.extra(user) : true;
}

export function can(user, action) {
  return Boolean(ACTIONS[action]?.(user));
}

/** Secciones visibles para el usuario, agrupadas para el menú lateral. */
export function navigationFor(user) {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: Object.entries(SECTIONS)
      .filter(([key, section]) => section.group === group.id && canAccess(user, key))
      .map(([key, section]) => ({ id: key, label: section.label, href: section.path, icon: section.icon })),
  })).filter((group) => group.items.length > 0);
}

// Pantalla de inicio por rol. EMPLEADO siempre llega a Caja.
const HOME_BY_ROLE = {
  [ROLES.EMPLEADO]: "caja",
  [ROLES.ADMIN]: "caja",
  [ROLES.RRHH]: "empleados",
};

export function homePathFor(user) {
  // La administración central no tiene caja propia: empieza en Inventario.
  const preferred = isAdminCentral(user) ? "inventario" : HOME_BY_ROLE[user?.role];
  if (preferred && canAccess(user, preferred)) return SECTIONS[preferred].path;
  const first = Object.keys(SECTIONS).find((key) => canAccess(user, key));
  return first ? SECTIONS[first].path : "/sin-acceso";
}

/** Sección a la que pertenece una ruta (la de prefijo más largo). */
export function sectionForPath(pathname) {
  let match = null;
  let matchLength = 0;
  for (const [key, section] of Object.entries(SECTIONS)) {
    for (const base of [section.path, ...(section.aliases ?? [])]) {
      const fits = pathname === base || pathname.startsWith(`${base}/`);
      if (fits && base.length > matchLength) {
        match = key;
        matchLength = base.length;
      }
    }
  }
  return match;
}

/** ¿Puede el usuario abrir esta ruta? Rutas sin sección conocida: no. */
export function canOpenPath(user, pathname) {
  const key = sectionForPath(pathname);
  return key !== null && canAccess(user, key);
}

export const ROLE_LABELS = Object.freeze({
  ADMIN: "Administración",
  RRHH: "Recursos humanos",
  EMPLEADO: "Empleado",
});

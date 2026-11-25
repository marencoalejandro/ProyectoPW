import { useCallback, useMemo, useState } from "react";
import { Outlet } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useResource } from "../../hooks/useResource";
import { getTurnoActual } from "../../api/cajaApi";
import { listarPlatillos, listarSucursales } from "../../api/catalogoApi";
import { CajaContext } from "./cajaContext";

const EMPTY_ORDER = Object.freeze({
  items: [],
  tipoDoc: "FACTURA",
  metodoPago: "EFECTIVO",
  cliente: null,
});

// Estado compartido por las pantallas de Caja (turno, POS, comprobantes):
// sucursal activa, turno abierto, menú con disponibilidad y el pedido en curso.
// El pedido vive aquí para que no se pierda al navegar entre pantallas de Caja
// ni cuando un cobro falla.
export default function CajaProvider() {
  const { user } = useAuth();
  const ownBranch = user?.branchId ?? null;

  // La administración central no tiene sucursal: elige en cuál operar.
  const [pickedBranch, setPickedBranch] = useState(null);
  const branchId = ownBranch ?? pickedBranch;

  const sucursales = useResource((signal) => listarSucursales({ signal }), "sucursales");

  const turno = useResource(
    (signal) => getTurnoActual({ sucursalId: ownBranch ? undefined : branchId, signal }),
    branchId ? `turno-${branchId}` : null,
  );

  const menu = useResource(
    (signal) => listarPlatillos({ sucursalId: ownBranch ? undefined : branchId }, { signal }),
    branchId ? `menu-${branchId}` : null,
  );

  const [order, setOrder] = useState(EMPTY_ORDER);

  const addItem = useCallback((platillo) => {
    setOrder((prev) => {
      const existing = prev.items.find((item) => item.platilloId === platillo.id);
      const items = existing
        ? prev.items.map((item) =>
            item.platilloId === platillo.id ? { ...item, cantidad: Math.min(item.cantidad + 1, 999) } : item,
          )
        : [...prev.items, { platilloId: platillo.id, nombre: platillo.nombre, precio: platillo.precio, cantidad: 1 }];
      return { ...prev, items };
    });
  }, []);

  const setQuantity = useCallback((platilloId, cantidad) => {
    setOrder((prev) => ({
      ...prev,
      items:
        cantidad <= 0
          ? prev.items.filter((item) => item.platilloId !== platilloId)
          : prev.items.map((item) =>
              item.platilloId === platilloId ? { ...item, cantidad: Math.min(cantidad, 999) } : item,
            ),
    }));
  }, []);

  const updateOrder = useCallback((changes) => setOrder((prev) => ({ ...prev, ...changes })), []);
  const clearOrder = useCallback(() => setOrder(EMPTY_ORDER), []);

  const selectBranch = useCallback(
    (id) => {
      setPickedBranch(id ? Number(id) : null);
      setOrder(EMPTY_ORDER);
    },
    [],
  );

  const branchName =
    user?.branchName ??
    sucursales.data?.find((s) => s.id === branchId)?.nombre ??
    (branchId ? `Sucursal #${branchId}` : null);

  const value = useMemo(
    () => ({
      user,
      branchId,
      branchName,
      canPickBranch: ownBranch === null,
      selectBranch,
      sucursales,
      turno,
      menu,
      order,
      addItem,
      setQuantity,
      updateOrder,
      clearOrder,
    }),
    [user, branchId, branchName, ownBranch, selectBranch, sucursales, turno, menu, order, addItem, setQuantity, updateOrder, clearOrder],
  );

  return (
    <CajaContext.Provider value={value}>
      <Outlet />
    </CajaContext.Provider>
  );
}

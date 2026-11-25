import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
  Menu,
  MenuButton,
  MenuItem,
  MenuItems,
} from "@headlessui/react";

import {
  ChefHat,
  ChevronDown,
  LogOut,
  Menu as MenuIcon,
  X,
} from "lucide-react";

import { Link, useLocation } from "react-router-dom";
import { ROLE_LABELS, sectionForPath } from "../../auth/access";

// La navegación llega por props (`navigation`), ya filtrada por rol desde
// auth/access.js: el layout no decide permisos.

function getInitials(name = "") {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "U"
  );
}

function Brand({ home = "/" }) {
  return (
    <Link
      to={home}
      className={`flex items-center gap-3 rounded-lg`}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-white">
        <ChefHat size={21} strokeWidth={1.8} aria-hidden="true" />
      </span>
      <span className="text-lg font-bold tracking-tight text-primary">
      {import.meta.env.VITE_APP_NAME || "Origenes SV"}
      </span>
    </Link>
  );
}

function SidebarLink({ item, activeSection, onNavigate }) {
  const Icon = item.icon;
  const active = activeSection === item.id;

  return (
    <Link
      to={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-150 motion-reduce:transition-none  ${
        active
          ? "bg-accent/25 text-primary"
          : "text-slate-600 hover:bg-canvas hover:text-primary"
      }`}
    >
      <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function SidebarGroup({ label, items, activeSection, onNavigate }) {
  return (
    <div>
      <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">
        {label}
      </p>
      <div className="space-y-1">
        {items.map((item) => (
          <SidebarLink
            key={item.id}
            item={item}
            activeSection={activeSection}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </div>
  );
}

function SidebarContent({ navigation, home, activeSection, onNavigate, onClose }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-primary/10 px-6">
        <Brand home={home} />
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar navegación"
            className={`flex size-10 items-center justify-center rounded-xl text-slate-600 transition-colors duration-150 hover:bg-canvas motion-reduce:transition-none `}
          >
            <X size={20} aria-hidden="true" />
          </button>
        )}
      </div>

      <nav
        aria-label="Navegación principal"
        className="flex-1 space-y-6 overflow-y-auto px-4 py-5"
      >
        {navigation.map((group) => (
          <SidebarGroup
            key={group.id}
            label={group.label}
            items={group.items}
            activeSection={activeSection}
            onNavigate={onNavigate}
          />
        ))}
      </nav>
    </div>
  );
}

function UserMenu({ user = {}, onLogout }) {
  const name = user.name || "Mi cuenta";

  return (
    <Menu>
      <MenuButton
        aria-label={`Menú de ${name}`}
        className={`group flex items-center gap-2 rounded-xl p-1.5 text-left transition-colors duration-150 hover:bg-white data-open:bg-white motion-reduce:transition-none `}
      >
        {user.avatar_url ? (
          <img
            src={user.avatar_url}
            alt=""
            className="size-9 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">
            {getInitials(name)}
          </span>
        )}

        <span className="hidden min-w-0 max-w-36 sm:block">
          <span className="block truncate text-sm font-semibold text-primary">
            {name}
          </span>
          {user.email && (
            <span className="block truncate text-xs text-slate-600">
              {user.email}
            </span>
          )}
        </span>

        <ChevronDown
          size={15}
          className="hidden shrink-0 text-slate-600 transition-transform duration-200 group-data-open:rotate-180 motion-reduce:transition-none sm:block"
          aria-hidden="true"
        />
      </MenuButton>

      <MenuItems
        transition
        anchor={{ to: "bottom end", gap: 8 }}
        className="z-50 w-52 origin-top-right rounded-xl border border-primary/10 bg-white p-1.5 shadow-lg transition duration-150 ease-out focus:outline-none data-closed:scale-95 data-closed:opacity-0 motion-reduce:transition-none"
      >
        <div className="px-3 py-2 text-xs text-slate-600">
          <p>
            <span className="font-semibold text-primary">Rol:</span>{" "}
            {ROLE_LABELS[user.role] ?? user.role ?? "Sin rol"}
          </p>
          {user.cargo && (
            <p>
              <span className="font-semibold text-primary">Cargo:</span> {user.cargo}
            </p>
          )}
          <p>
            <span className="font-semibold text-primary">Sucursal:</span>{" "}
            {user.branchName ?? (user.branchId ? `#${user.branchId}` : "Administración central")}
          </p>
        </div>

        <div className="my-1 border-t border-primary/10" />

        <MenuItem>
          <button
            type="button"
            onClick={onLogout}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-700 data-focus:bg-red-50"
          >
            <LogOut size={16} aria-hidden="true" />
            Cerrar sesión
          </button>
        </MenuItem>
      </MenuItems>
    </Menu>
  );
}

export default function AdminLayout({
  user = {},
  navigation = [],
  home = "/",
  workspace = {},
  pageTitle,
  onLogout,
  children,
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const activeSection = sectionForPath(location.pathname);

  // Guía de diseño: tras navegar, el foco pasa al título de la pantalla
  // (o al contenido principal) para que el lector de pantalla lo anuncie.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return undefined;
    }
    const timer = setTimeout(() => {
      const main = document.getElementById("main-content");
      const title = main?.querySelector("h2.os-title");
      if (title) {
        title.setAttribute("tabindex", "-1");
        title.focus({ preventScroll: true });
      } else {
        main?.focus({ preventScroll: true });
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [location.pathname]);

  // Si la pantalla pasa a escritorio con el menú abierto, se cierra.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const handleChange = (e) => {
      if (e.matches) setMobileMenuOpen(false);
    };
    mq.addEventListener("change", handleChange);
    return () => mq.removeEventListener("change", handleChange);
  }, []);

  const currentPage =
    pageTitle ||
    navigation.flatMap((group) => group.items).find((item) => item.id === activeSection)?.label ||
    "Orígenes SV";

  const closeMobileMenu = () => setMobileMenuOpen(false);

  return (
    <div className="min-h-dvh bg-canvas font-sans text-primary">

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-primary/10 bg-white lg:block">
        <SidebarContent navigation={navigation} home={home} activeSection={activeSection} />
      </aside>

      <Dialog
        open={mobileMenuOpen}
        onClose={setMobileMenuOpen}
        className="relative z-50 lg:hidden"
      >
        <DialogBackdrop
          transition
          className="fixed inset-0 bg-slate-950/30 transition-opacity duration-200 ease-out data-closed:opacity-0 motion-reduce:transition-none"
        />

        <div className="fixed inset-0 flex">
          <DialogPanel
            transition
            className="h-full w-[min(84vw,20rem)] bg-white shadow-xl transition-transform duration-200 ease-out data-closed:-translate-x-full motion-reduce:transition-none"
          >
            <DialogTitle className="sr-only">Navegación principal</DialogTitle>
            <SidebarContent
              navigation={navigation}
              home={home}
              activeSection={activeSection}
              onNavigate={closeMobileMenu}
              onClose={closeMobileMenu}
            />
          </DialogPanel>
        </div>
      </Dialog>

      <div className="flex min-h-dvh min-w-0 flex-col lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-primary/10 bg-canvas/95 backdrop-blur-sm">
          <div className="mx-auto flex h-16 max-w-360 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                aria-label="Abrir navegación"
                className={`flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/10 bg-white text-primary transition-colors duration-150 hover:bg-accent/25 motion-reduce:transition-none lg:hidden `}
              >
                <MenuIcon size={19} aria-hidden="true" />
              </button>

              <div className="min-w-0">
                <p className="truncate text-xs text-slate-600">
                  {workspace?.name || "Espacio de trabajo"}
                </p>
                <h1 className="truncate text-sm font-semibold text-primary sm:text-base">
                  {currentPage}
                </h1>
              </div>
            </div>

            <UserMenu user={user} onLogout={onLogout} />
          </div>
        </header>

        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-360 flex-1 px-4 py-6 focus:outline-none sm:px-6 sm:py-8 lg:px-8"
        >
          {children}
        </main>
      </div>
    </div>
  );
}

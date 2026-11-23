// Tabla con el estilo .os-table. La página decide datos, formatos, acciones y
// permisos: aquí solo se arma el encabezado y se componen cuerpo y pie.
//
// columns: [{ key, label, numeric?, srOnly?, className? }]. Una entrada falsa
// (por ejemplo `central && {...}`) se omite, para columnas condicionales.
// caption: texto del <caption>; por defecto solo para lectores de pantalla.
export default function DataTable({ caption, captionClassName = "os-sr", columns, children, footer, className = "" }) {
  return (
    <table className={className ? `os-table ${className}` : "os-table"}>
      {caption && <caption className={captionClassName}>{caption}</caption>}
      <thead>
        <tr>
          {columns.filter(Boolean).map((col) => (
            <th
              key={col.key}
              scope="col"
              className={[col.numeric && "os-number", col.className].filter(Boolean).join(" ") || undefined}
            >
              {col.srOnly ? <span className="os-sr">{col.label}</span> : col.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
      {footer && <tfoot>{footer}</tfoot>}
    </table>
  );
}

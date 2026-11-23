// Guía de diseño: al enviar un formulario con errores, el foco va al primer
// campo inválido. Se espera un ciclo para que React pinte aria-invalid.
export function focusFirstInvalid(form) {
  if (!form) return;
  setTimeout(() => {
    form.querySelector('[aria-invalid="true"]')?.focus();
  }, 0);
}

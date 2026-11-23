import { Input, Label, Field } from "@headlessui/react";

// Campo de texto o correo del login (Headless UI). Funciona sin estado
// controlado: el formulario puede leer los valores con FormData.
// Para contraseñas usar PasswordInput.
export default function TextInput({
    label,
    name,
    value,
    onChange,
    type = "text",
    placeholder = "",
    required = false,
    autoComplete = "off",
    className = "",
    ...props
}) {
    return (
        <Field className="w-full">
            {label && (
                <Label className="auth-label">
                    {label}
                </Label>
            )}

            <div className="relative">
                <Input
                    type={type}
                    name={name}
                    value={value}
                    onChange={onChange}
                    placeholder={placeholder}
                    required={required}
                    autoComplete={autoComplete}
                    className={`input-base ${className}`}
                    {...props}
                />
            </div>
        </Field>
    );
}

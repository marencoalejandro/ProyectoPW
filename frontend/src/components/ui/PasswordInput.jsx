import { useState } from "react";
import { Input, Label, Field as HeadlessField } from "@headlessui/react";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff } from "lucide-react";
import { Field } from "./Field";

// Control interno: el input y, si `toggle`, el botón de ojo para mostrar u
// ocultar la contraseña. Siempre empieza oculta. Con el ojo propio se esconde
// el botón nativo de Edge (.os-password) para no mostrar dos íconos.
function PasswordControl({ as: InputComponent = "input", toggle = true, className = "", ...inputProps }) {
    const [showPassword, setShowPassword] = useState(false);
    const visible = toggle && showPassword;

    return (
        <div className="relative">
            <InputComponent
                type={visible ? "text" : "password"}
                className={[toggle && "os-password pr-12", className].filter(Boolean).join(" ")}
                {...inputProps}
            />

            {toggle && (
                <motion.button
                    type="button"
                    onClick={() => setShowPassword(prev => !prev)}
                    whileHover={{ scale: 1.12 }}
                    whileTap={{ scale: 0.88 }}
                    transition={{
                        type: "spring",
                        stiffness: 400,
                        damping: 20
                    }}
                    aria-label={
                        showPassword
                            ? "Ocultar contraseña"
                            : "Mostrar contraseña"
                    }
                    aria-pressed={showPassword}
                    className="
                        absolute right-3 top-1/2
                        -translate-y-1/2
                        flex h-8 w-8
                        items-center justify-center
                        rounded-lg
                        text-slate-400
                        transition-colors
                        hover:bg-accent/20
                        hover:text-primary
                        focus-visible:outline-2
                        focus-visible:outline-primary
                    "
                >
                    <AnimatePresence mode="wait" initial={false}>
                        <motion.span
                            key={showPassword ? "visible" : "hidden"}
                            initial={{
                                opacity: 0,
                                scale: 0.7,
                                rotate: -20
                            }}
                            animate={{
                                opacity: 1,
                                scale: 1,
                                rotate: 0
                            }}
                            exit={{
                                opacity: 0,
                                scale: 0.7,
                                rotate: 20
                            }}
                            transition={{ duration: 0.15 }}
                            className="flex items-center justify-center"
                        >
                            {showPassword ? (
                                <EyeOff size={19} strokeWidth={1.8} />
                            ) : (
                                <Eye size={19} strokeWidth={1.8} />
                            )}
                        </motion.span>
                    </AnimatePresence>
                </motion.button>
            )}
        </div>
    );
}

// Contraseña del login (Headless UI). Sin estado controlado: el formulario la
// lee con FormData.
export default function PasswordInput({
    label,
    autoComplete = "current-password",
    required = false,
    className = "",
    ...props
}) {
    return (
        <HeadlessField className="w-full">
            {label && (
                <Label className="auth-label">
                    {label}
                </Label>
            )}
            <PasswordControl
                as={Input}
                autoComplete={autoComplete}
                required={required}
                className={`input-base ${className}`}
                {...props}
            />
        </HeadlessField>
    );
}

// Contraseña en formularios administrativos, con etiqueta, ayuda y error de
// ui/Field. Sin ojo por defecto, como el campo que asigna RR. HH.
export function PasswordField({
    label,
    error,
    hint,
    required,
    className,
    inputClassName = "",
    toggle = false,
    autoComplete = "new-password",
    ...props
}) {
    return (
        <Field label={label} error={error} hint={hint} required={required} className={className}>
            {(aria) => (
                <PasswordControl
                    toggle={toggle}
                    autoComplete={autoComplete}
                    className={`os-input bg-white ${inputClassName}`}
                    {...aria}
                    {...props}
                />
            )}
        </Field>
    );
}

import { useCallback, useEffect, useEffectEvent, useState } from "react";

/**
 * Carga datos de la API y expone { data, error, loading, reload }.
 * `key` identifica la consulta: si cambia, se vuelve a pedir; con `null` no
 * se pide nada. Mientras recarga se conservan los datos anteriores.
 */
export function useResource(load, key) {
  const [state, setState] = useState({ key: null, data: undefined, error: null });
  const [nonce, setNonce] = useState(0);
  const requestKey = key === null || key === undefined ? null : `${key}#${nonce}`;

  const run = useEffectEvent((signal) => load(signal));

  useEffect(() => {
    if (requestKey === null) return undefined;
    const controller = new AbortController();
    run(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setState({ key: requestKey, data, error: null });
      },
      (error) => {
        if (!controller.signal.aborted) {
          setState((prev) => ({ key: requestKey, data: prev.data, error }));
        }
      },
    );
    return () => controller.abort();
  }, [requestKey]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const settled = state.key === requestKey;

  return {
    data: state.data,
    error: settled ? state.error : null,
    loading: requestKey !== null && !settled,
    reload,
  };
}

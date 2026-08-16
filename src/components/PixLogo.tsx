/** Marca do Pix (Banco Central) — símbolo + wordmark, igual ao checkout de referência. */
export function PixMark({ size = 22, color = '#32BCAD' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true" focusable="false">
      <path
        fill={color}
        d="M242.4 292.5c5.4-5.4 14.7-5.4 20.1 0l77 77c14.2 14.2 33.1 22 53.1 22h15.1l-97.1 97.1c-30.3 29.5-79.5 29.5-109.8 0L103.3 391h9.3c20 0 38.9-7.8 53.1-22l76.7-76.5zm20.1-73.6c-5.6 5.4-15 5.6-20.1 0l-76.7-76.7c-14.2-14.2-33.1-22-53.1-22h-9.3l97.5-97.4c30.3-30.4 79.5-30.4 109.8 0l97.2 97.1h-15.2c-20 0-38.9 7.8-53.1 22l-77 77zM112.6 142.7c13.8 0 26.5 5.6 37.1 15.3l76.7 76.6c7.2 7.2 16.6 10.8 26.1 10.8s18.9-3.6 26.1-10.8l77-77c9.7-9.7 23.2-15.3 37.1-15.3h37.7l58.3 58.3c30.3 30.3 30.3 79.5 0 109.8l-58.3 58.3h-37.7c-13.9 0-27.4-5.6-37.1-15.3l-77-77c-13.9-13.9-38.2-13.9-52.1.1l-76.7 76.6c-10.6 9.7-23.3 15.3-37.1 15.3H80.4l-57.6-58c-30.4-30.3-30.4-79.5 0-109.8l57.6-57.9h32.2z"
      />
    </svg>
  );
}

/** Bloco usado no seletor de forma de pagamento. */
export default function PixLogo() {
  return (
    <span className="pix-logo">
      <PixMark size={26} />
      <span className="pix-word">
        <b>pix</b>
        <i>Meio de pagamento do Banco Central</i>
      </span>
    </span>
  );
}

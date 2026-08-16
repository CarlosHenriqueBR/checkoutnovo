import Script from 'next/script';

export type BrowserPixel =
  | { platform: 'meta'; id: string }
  | { platform: 'ga4'; id: string }
  | { platform: 'google_ads'; id: string; label?: string }
  | { platform: 'tiktok'; id: string }
  | { platform: 'kwai'; id: string };

interface Props {
  pixels: BrowserPixel[];
  /** Evento disparado no carregamento da página. */
  event?: 'InitiateCheckout' | 'ViewContent' | 'Purchase' | 'none';
  /** Dados da compra (usado na página de obrigado). */
  purchase?: { value: number; currency: string; transactionId: string; contentName: string };
}

/**
 * Injeta os pixels de NAVEGADOR de todas as contas vinculadas ao checkout.
 * Suporta MÚLTIPLAS contas por plataforma — cada gtag/fbq recebe seu próprio ID.
 * O evento de compra também é enviado server-side (CAPI/MP/OCI) com o mesmo
 * event_id, o que garante deduplicação.
 */
export default function PixelScripts({ pixels, event = 'none', purchase }: Props) {
  if (!pixels.length) return null;

  const meta = pixels.filter((p) => p.platform === 'meta');
  const ga4 = pixels.filter((p) => p.platform === 'ga4');
  const ads = pixels.filter((p): p is Extract<BrowserPixel, { platform: 'google_ads' }> => p.platform === 'google_ads');
  const tiktok = pixels.filter((p) => p.platform === 'tiktok');
  const kwai = pixels.filter((p) => p.platform === 'kwai');

  const googleIds = [...ga4.map((g) => g.id), ...ads.map((a) => a.id)];

  const eventId = purchase?.transactionId || '';
  const value = purchase?.value ?? 0;

  const metaScript = meta.length
    ? `
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
${meta.map((m) => `fbq('init','${m.id}');`).join('\n')}
fbq('track','PageView');
${
  event === 'Purchase'
    ? `fbq('track','Purchase',{value:${value},currency:'BRL',content_name:${JSON.stringify(purchase?.contentName || '')}},{eventID:${JSON.stringify(eventId)}});`
    : event !== 'none'
      ? `fbq('track','${event}');`
      : ''
}`
    : '';

  const googleScript = googleIds.length
    ? `
window.dataLayer=window.dataLayer||[];
function gtag(){dataLayer.push(arguments);}
gtag('js',new Date());
${googleIds.map((id) => `gtag('config','${id}');`).join('\n')}
${
  event === 'Purchase'
    ? [
        ...ga4.map(
          (g) =>
            `gtag('event','purchase',{send_to:'${g.id}',transaction_id:${JSON.stringify(eventId)},value:${value},currency:'BRL'});`,
        ),
        ...ads.map(
          (a) =>
            `gtag('event','conversion',{send_to:'${a.id}${a.label ? `/${a.label}` : ''}',transaction_id:${JSON.stringify(eventId)},value:${value},currency:'BRL'});`,
        ),
      ].join('\n')
    : ''
}`
    : '';

  const tiktokScript = tiktok.length
    ? `
!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=i,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var o=document.createElement("script");o.type="text/javascript",o.async=!0,o.src=i+"?sdkid="+e+"&lib="+t;var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};
${tiktok.map((p) => `ttq.load('${p.id}');`).join('\n')}
ttq.page();
${
  event === 'Purchase'
    ? `ttq.track('CompletePayment',{value:${value},currency:'BRL',event_id:${JSON.stringify(eventId)}});`
    : event === 'InitiateCheckout'
      ? `ttq.track('InitiateCheckout');`
      : ''
}
}(window,document,'ttq');`
    : '';

  const kwaiScript = kwai.length
    ? `
!function(e,t,n){e.kwaiq=e.kwaiq||[];var a=e.kwaiq;a.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","load"],a.factory=function(e){return function(){var t=Array.prototype.slice.call(arguments);return t.unshift(e),a.push(t),a}};for(var i=0;i<a.methods.length;i++){var o=a.methods[i];a[o]=a.factory(o)}var s=t.createElement("script");s.type="text/javascript",s.async=!0,s.src="https://s1.kwai.net/kos/s101/nlav11187/pixel/events.js";var r=t.getElementsByTagName("script")[0];r.parentNode.insertBefore(s,r)}(window,document);
${kwai.map((p) => `kwaiq.load('${p.id}');`).join('\n')}
kwaiq.page();
${event === 'Purchase' ? `kwaiq.track('purchase',{value:${value},currency:'BRL'});` : ''}`
    : '';

  return (
    <>
      {googleIds.length > 0 && (
        <Script
          id="vg-gtag-src"
          strategy="afterInteractive"
          src={`https://www.googletagmanager.com/gtag/js?id=${googleIds[0]}`}
        />
      )}
      {googleScript && <Script id="vg-google" strategy="afterInteractive">{googleScript}</Script>}
      {metaScript && <Script id="vg-meta" strategy="afterInteractive">{metaScript}</Script>}
      {tiktokScript && <Script id="vg-tiktok" strategy="afterInteractive">{tiktokScript}</Script>}
      {kwaiScript && <Script id="vg-kwai" strategy="afterInteractive">{kwaiScript}</Script>}
    </>
  );
}

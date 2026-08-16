# Auditoria de rastreamento — Duttyfy PIX

Auditoria feita sobre o código deste repositório (`vega-checkout`), seguindo os três passos pedidos.
Nenhum arquivo foi modificado para produzir este relatório.

---

## Passo 1 — Onde o body da requisição ao gateway é montado

**Arquivo:** `src/lib/duttyfy.ts` → função `createCharge()` (linhas ~95-125)

```ts
const body = {
  amount: input.amount,
  description: input.description,
  customer: { name, document, email, phone },
  item: { title, price, quantity },
  paymentMethod: 'PIX' as const,
  utm: input.utm,          // <── campo de rastreamento
};
```

O POST vai para `gateway.encrypted_url` (a URL encriptada da Duttyfy), **sempre no backend**
(`export const runtime = 'nodejs'` em todas as rotas). A chave nunca é exposta ao navegador.

Quem chama `createCharge()` é `src/lib/checkoutService.ts` → `createPixCharge()`, que é o
**único** ponto de criação de cobrança da aplicação. As três rotas de entrada passam por ele:

| Rota | Uso |
|---|---|
| `src/app/api/pix/create/route.ts` | produto principal, ticket menor e order bump |
| `src/app/api/pix/upsell/route.ts` | upsell e downsell (one-click) |

**Resultado: ✅ EXISTE e está CORRETO** — um único ponto de montagem, server-side, com o campo `utm` presente.

---

## Passo 2 — De onde vem o valor de `utm`

Cadeia completa:

1. `createPixCharge()` recebe `req.tracking` (objeto vindo do navegador).
2. Normaliza com `normalizeTracking()` — `src/lib/attribution.ts`: descarta chaves desconhecidas,
   valores vazios, `"undefined"`/`"null"`, e corta em 512 caracteres.
3. Monta a query string crua com `buildUtmString()`:

```ts
export function buildUtmString(tracking: TrackingData): string {
  const parts: string[] = [];
  for (const key of TRACKED_KEYS) {
    const v = tracking[key];
    if (v) parts.push(`${key}=${encodeURIComponent(v)}`);
  }
  return parts.join('&');
}
```

`TRACKED_KEYS` inclui, em ordem determinística:
`utm_source, utm_medium, utm_campaign, utm_content, utm_term, utm_id, src, sck,`
**`fbclid`**`, fbp, fbc, `**`ttclid`**`, `**`click_id`**`, `**`gclid`**`, wbraid, gbraid, xcod, ref`.

4. A mesma string é gravada em `orders.utm_raw` **antes** da chamada ao gateway, e o objeto
   separado em `orders.tracking_json`. Isso permite auditar, por venda, exatamente o que foi enviado
   (visível em `/dashboard/pedidos` → *Detalhes*).

**Está sendo populado ou vem vazio?**
Populado — desde que o `/t.js` esteja instalado na página de entrada (ver Passo 3).
Se o visitante chegar sem nenhum parâmetro, `buildUtmString()` devolve string vazia
(nunca `undefined`), e o dashboard marca a venda com a tag vermelha **"sem click ID"**.

**Nos upsells:** `src/app/api/pix/upsell/route.ts` lê o rastreamento do **pedido pai**
e sobrepõe o que veio do navegador — garantindo que upsell 1, upsell 2 e downsells
carreguem exatamente o mesmo `utm` da venda principal.

**Resultado: ✅ EXISTE e está CORRETO.**

---

## Passo 3 — Captura de rastreamento

### 3.1 Leitura de `window.location.search` na página de entrada

**Arquivo:** `public/t.js` → função `fromUrl()`

Lê da URL: `fbclid`, `ttclid`, `click_id`, `gclid`, `wbraid`, `gbraid`, todas as `utm_*`,
`src`, `sck`, `xcod`, `ref`. Também aceita as variantes do Kwai (`clickid`, `kwai_click_id`,
`kwaiclickid`) e as normaliza para `click_id`.

Complementarmente lê os cookies `_fbp` e `_fbc` gravados pelo pixel do Facebook, e reconstrói
`fbc` a partir do `fbclid` quando o pixel ainda não o gravou.

**Resultado: ✅ EXISTE e está CORRETO.**

> ⚠️ Dependência operacional: o script precisa ser colado no `<head>` de **toda** página de
> entrada de anúncio. Dentro do checkout ele já é injetado por `src/app/layout.tsx`. Se as
> páginas de presell/VSL não tiverem a tag, o click ID se perde antes de chegar aqui —
> nenhum código consegue recuperar depois.

### 3.2 Persistência em localStorage

**Arquivo:** `public/t.js` → `save()`

Grava em `localStorage['vg_track']` **e** em cookie 1st-party `vg_track` (30 dias, domínio raiz,
`SameSite=Lax`). O cookie serve de fallback quando o `localStorage` está bloqueado ou quando o
funil atravessa subdomínios.

Regra de sobrescrita: um **novo clique pago** (qualquer click ID na URL) zera a atribuição
anterior; sem clique novo, os valores antigos são preservados e apenas complementados.

Há ainda um backup server-side não bloqueante: `POST /api/track` grava a sessão em
`tracking_sessions` (`src/app/api/track/route.ts`).

**Resultado: ✅ EXISTE e está CORRETO.**

### 3.3 Recuperação no checkout / onde o body é montado

**Arquivo:** `src/app/c/[slug]/CheckoutClient.tsx`

```ts
const tracking = window.VegaTrack?.get?.() ?? {};
// ...
body: JSON.stringify({ slug, offer, bump, customer, tracking })
```

O servidor não confia no que chega: `normalizeTracking()` filtra, e o **preço nunca vem do
cliente** — é lido do banco pelo slug.

O `/t.js` também decora automaticamente todos os links internos com os parâmetros
(`decorateLinks()`), de modo que o rastreamento sobrevive à navegação presell → checkout
mesmo sem localStorage.

**Resultado: ✅ EXISTE e está CORRETO.**

---

## Checagens adicionais

| Item | Status |
|---|---|
| Chave/URL encriptada fora do front-end | ✅ Só no servidor (`gateways.encrypted_url`, rotas `runtime: 'nodejs'`); a listagem no painel devolve mascarada |
| Webhook como fonte primária | ✅ `src/app/api/webhooks/duttyfy/route.ts`, com `?s=WEBHOOK_SECRET` |
| Polling como fallback | ✅ `GET /api/pix/status`, intervalo configurável (padrão 5s) |
| Idempotência por transação | ✅ Tabela `idempotency` + `claimPaid()`; webhook e polling compartilham a trava |
| `items` como objeto no webhook | ✅ `webhookItems()` aceita objeto e array |
| Ausência de `transactionId` em COMPLETED | ✅ `webhookTransactionId()` cai para `_id.$oid` |
| Resposta 2xx em < 5s | ✅ Conversões disparadas via `after()`, depois da resposta |
| Valores em centavos | ✅ Inteiro em todo o schema e nas integrações |
| CPF 11 dígitos / telefone com DDD | ✅ `isValidCPF()`, `isValidPhone()`, `onlyDigits()` antes do envio |
| Chave da API em log | ✅ Não registrada; o log do webhook grava só `transactionId` e `status` |

---

## Ponto de atenção (não é defeito de código)

⚠️ **Assinatura HMAC do webhook** — a documentação da Duttyfy lista
`X-Duttyfy-Timestamp` e `X-Duttyfy-Signature` como *roadmap*. Hoje a autenticação do endpoint é
feita pelo segredo na query (`?s=`). Quando a Duttyfy publicar a assinatura, o ponto de validação
é o topo de `src/app/api/webhooks/duttyfy/route.ts`.

# Vega Checkout

Checkout PIX em Next.js 15 com dashboard próprio, funil de upsells, backredirect com ticket menor,
múltiplas contas de pixel e rastreamento amarrado ponta a ponta entre **checkout → Duttyfy → UTMify → plataformas de anúncio**.

---

## 1. Instalação

```bash
cp .env.example .env.local     # preencha as variáveis
npm install
npm run dev                    # http://localhost:3000
```

Na primeira execução o banco SQLite é criado automaticamente em `./data/vega.db`
(o schema completo está em `src/lib/schema.ts`).

Opcional — dados de exemplo:

```bash
npm run seed                   # cria produto, checkout /c/receitas-fit e 2 upsells
```

### Variáveis de ambiente

| Variável | Para que serve |
|---|---|
| `NEXT_PUBLIC_APP_URL` | URL pública (webhooks, links do funil) |
| `DASHBOARD_PASSWORD` | senha do painel em `/login` |
| `SESSION_SECRET` | assina o cookie de sessão do painel |
| `WEBHOOK_SECRET` | valor de `?s=` na URL do webhook da Duttyfy |
| `DATABASE_FILE` | caminho do SQLite (padrão `./data/vega.db`) |
| `UPLOAD_DIR` | pasta local das imagens (padrão `./public/uploads`) |
| `GATEWAY_MOCK` | `1` gera PIX falso, sem chamar a Duttyfy — para testar o funil inteiro |
| `UTMIFY_API_TOKEN` | opcional; também pode ser salvo pelo painel |

---

## 2. Configuração (tudo pelo dashboard)

Acesse `/dashboard` e configure nesta ordem:

1. **Gateway PIX** — cole a URL encriptada gerada na Duttyfy (*Integrações e Chaves → Chaves API*).
   A chave fica **só no servidor**; nenhuma requisição do navegador a enxerga.
   Na mesma tela está a URL de webhook para colar em *Integrações e Chaves → Webhooks*:
   `https://SEU-DOMINIO/api/webhooks/duttyfy?s=WEBHOOK_SECRET`
2. **Pixels** — cadastre quantas contas quiser, inclusive várias do Google.
3. **Produtos** — nome, imagem, valor e link de entrega.
4. **Upsells** — páginas personalizáveis com blocos, valor, downsell e ligação entre elas.
5. **Checkouts** — imagem, valor, ticket menor, backredirect, order bump, primeiro upsell e
   quais contas de pixel recebem a venda.

### Script de rastreamento nas páginas de entrada

Cole no `<head>` de **toda** página que recebe tráfego de anúncio (presell, VSL, landing):

```html
<script src="https://SEU-DOMINIO/t.js" async></script>
```

No checkout ele já vem embutido. Sem esse script nas páginas de entrada,
`fbclid`, `ttclid`, `click_id` e `gclid` não chegam ao gateway.

---

## 3. Como o rastreamento é amarrado

```
Anúncio ──► página de entrada (/t.js)
              captura fbclid, ttclid, click_id, gclid, wbraid, gbraid,
              utm_*, src, sck, xcod, ref, _fbp, _fbc
              ↓ localStorage (30 dias) + cookie 1st-party + POST /api/track
            checkout /c/[slug]
              lê o objeto do navegador e envia no POST
              ↓
            /api/pix/create  ──►  buildUtmString()  ──►  campo `utm` da Duttyfy
              a MESMA string é salva em orders.utm_raw
              ↓
            UTMify (waiting_payment)
              ↓  webhook COMPLETED (ou polling de 5s)
            /api/webhooks/duttyfy
              ↓ idempotência por transactionId (ou _id.$oid)
            dispatchPurchase()
              Google Ads (gclid) • GA4 • Meta CAPI • TikTok • Kwai • UTMify (paid)
```

Os upsells reaproveitam o rastreamento do **pedido pai**, então toda a cadeia
(principal → bump → upsell 1 → upsell 2 → downsell) carrega o mesmo `utm`.

Formato enviado no campo `utm` (query string crua, como a Duttyfy espera):

```
utm_source=facebook&utm_medium=cpc&utm_campaign=aula-demo&fbclid=…&ttclid=…&click_id=…&gclid=…
```

---

## 4. Fluxo do funil

- **Checkout** `/c/[slug]` — autofill de nome/CPF/e-mail/telefone a partir do `localStorage`,
  order bump, contador, tela de PIX com QR e copia-e-cola, polling do status.
- **Backredirect** — trava do botão *voltar* + *exit intent* no desktop.
  Se houver ticket menor configurado, abre a oferta; se recusar, vai para a URL de backredirect.
- **Upsell** `/u/[slug]` — one-click (usa os dados já pagos), páginas montadas por blocos,
  downsell embutido no botão de recusa, encadeamento livre entre upsells.
- **Obrigado** `/obrigado?o=ORDER_ID` — dispara o `Purchase` no navegador com o mesmo
  `event_id` do envio server-side (deduplicação).

---

## 5. Verificação de pagamento

| Canal | Papel | Onde |
|---|---|---|
| Webhook | fonte primária | `POST /api/webhooks/duttyfy?s=…` |
| Polling | fallback a cada 5s | `GET /api/pix/status?orderId=…` |

Os dois usam a mesma trava (`claimIdempotency`), então a conversão nunca dispara duas vezes —
mesmo que webhook e polling confirmem no mesmo instante. O webhook responde 2xx imediatamente
e o disparo das conversões roda depois da resposta (`after()`), respeitando o limite de 5s.

Detalhes tratados conforme a documentação:
- `items` chega como **objeto**, não array (`webhookItems()` normaliza os dois formatos);
- em `COMPLETED` pode não vir `transactionId` — usamos `_id.$oid` (`webhookTransactionId()`).

---

## 6. Performance

- Checkout renderizado no servidor, sem framework de CSS e sem fetch no primeiro paint.
- CSS único (~9 KB) e nenhuma fonte externa.
- Scripts de pixel com `strategy="afterInteractive"` — não bloqueiam o formulário.
- `better-sqlite3` é síncrono e local: leitura do checkout em microssegundos, sem round-trip de rede.

---

## 7. Deploy

O app usa filesystem (SQLite + uploads), então precisa de um runtime Node com disco persistente:
VPS, Docker, Fly.io, Railway, Render.

```bash
npm run build
npm start
```

Monte um volume persistente para `./data` e `./public/uploads`.

**Cloudflare Workers/Pages não roda `better-sqlite3`** (é módulo nativo). Para migrar depois:
o schema é SQLite puro, então `data/vega.db` importa direto no **D1**
(`wrangler d1 execute`), e só `src/lib/db.ts` precisa trocar de driver — o resto do código
usa apenas `all()`, `one()`, `run()` e `tx()`. As imagens migram para R2 alterando
`src/app/api/upload/route.ts`.

---

## 8. Mapa do código

```
src/lib/attribution.ts     captura, normalização e montagem da string `utm`
src/lib/duttyfy.ts         cliente da API PIX (criar, consultar, parser de webhook)
src/lib/checkoutService.ts único ponto que cria cobrança — checkout, bump, upsell e downsell
src/lib/orders.ts          idempotência e marcação de pago
src/lib/dispatch.ts        orquestra as conversões das contas vinculadas
src/lib/integrations/      google (Ads OCI + GA4 MP), meta, tiktok, kwai, utmify
public/t.js                script de rastreamento das páginas de entrada
src/app/c/[slug]           checkout público
src/app/u/[slug]           upsell / downsell
src/app/dashboard          painel completo
```

---

## 9. Deploy no Railway

O projeto já vem com `Dockerfile`, `.dockerignore` e `railway.json`.
O build (`npm install` + `next build`) roda dentro do Railway.

### Passo a passo

1. **Suba o código.** Duas opções:
   - **Railway CLI (sem GitHub):** `npm i -g @railway/cli`, depois `railway login`,
     `railway init` e `railway up` de dentro da pasta do projeto.
   - **GitHub:** crie um repositório, faça push e conecte o repo no Railway.
2. **Volume persistente** — obrigatório. Em *Service → Settings → Volumes*, monte em `/data`.
   O SQLite (`/data/vega.db`) e as imagens (`/data/uploads`) ficam nele. Sem volume, tudo é
   perdido a cada deploy.
3. **Variáveis** (*Service → Variables*):

   | Variável | Valor |
   |---|---|
   | `NEXT_PUBLIC_APP_URL` | `https://SEU-APP.up.railway.app` |
   | `DASHBOARD_PASSWORD` | a senha que você vai usar em `/login` |
   | `SESSION_SECRET` | string longa aleatória |
   | `WEBHOOK_SECRET` | string aleatória (vai no `?s=` do webhook) |
   | `DATABASE_FILE` | `/data/vega.db` |
   | `UPLOAD_DIR` | `/data/uploads` |
   | `NODE_ENV` | `production` |
   | `GATEWAY_MOCK` | `0` (use `1` para testar o funil sem chamar a Duttyfy) |

4. **Domínio** — *Settings → Networking → Generate Domain*.
   Depois volte e ajuste `NEXT_PUBLIC_APP_URL` para o domínio gerado.
5. **Healthcheck** — já configurado em `/api/health` pelo `railway.json`.

### Depois do deploy

1. Acesse `https://SEU-APP.up.railway.app/login` com a `DASHBOARD_PASSWORD`.
2. **Gateway PIX** → cole a URL encriptada da Duttyfy.
3. Na Duttyfy, cadastre o webhook: `https://SEU-APP.up.railway.app/api/webhooks/duttyfy?s=WEBHOOK_SECRET`
4. **Pixels** → cadastre as contas do Google e das demais plataformas.
5. **Produtos** → suba a imagem do produto (fica no volume).
6. **Checkouts** → valor, ticket menor, backredirect, order bump e upsell.
7. Cole `<script src="https://SEU-APP.up.railway.app/t.js" async></script>` no `<head>`
   das páginas de entrada dos anúncios.

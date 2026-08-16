# Deploy — Railway (já configurado)

O projeto no Railway **já está criado e configurado**. Falta só enviar o código.

| Item | Valor |
|---|---|
|  Projeto | `checkout-pix` |
| Ambiente | `production` |
| Serviço | `checkout` |
| Domínio | https://checkout-production-cdb6.up.railway.app |
| Volume | `vega-data` montado em `/data` |
| Build | Dockerfile (`Dockerfile` na raiz) |
| Healthcheck | `/api/health` |

As variáveis de ambiente já estão setadas no serviço — não precisa mexer.

---

## 1. Enviar o código (única etapa manual)

Descompacte o zip, abra o terminal **dentro da pasta `vega-checkout`** e rode:

```bash
npm i -g @railway/cli
railway login
railway link          # escolha o projeto "checkout-pix" → ambiente production → serviço checkout
railway up
```

`railway up` envia a pasta direto para o Railway — não precisa de GitHub.
O build leva alguns minutos na primeira vez (compila o `better-sqlite3`).

Acompanhe em: https://railway.com/project/99249118-09c5-4754-b21b-21b50a2828b1

---

## 2. Entrar no painel

https://checkout-production-cdb6.up.railway.app/login

Senha: a que está na variável `DASHBOARD_PASSWORD` do serviço.

---

## 3. Configurar (na ordem)

1. **Gateway PIX** → cole a URL encriptada da Duttyfy (*Integrações e Chaves → Chaves API*).
2. Na Duttyfy, em *Integrações e Chaves → Webhooks*, cadastre:

   ```
   https://checkout-production-cdb6.up.railway.app/api/webhooks/duttyfy?s=<WEBHOOK_SECRET>
   ```

   O valor de `<WEBHOOK_SECRET>` está nas variáveis do serviço no Railway.
3. **Pixels** → cadastre as contas (várias do Google, Meta, TikTok, Kwai).
4. **Integrações** → cole o token da UTMify.
5. **Produtos** → nome, imagem (upload vai para o volume), valor e link de entrega.
6. **Upsells** → páginas, valores, downsell e as ligações aceitar/recusar.
7. **Checkouts** → valor, ticket menor, backredirect, order bump, primeiro upsell e
   quais contas de pixel recebem a venda.

---

## 4. Script de rastreamento

Cole no `<head>` de **toda** página que recebe tráfego de anúncio:

```html
<script src="https://checkout-production-cdb6.up.railway.app/t.js" async></script>
```

Sem isso, `fbclid`, `ttclid`, `click_id` e `gclid` não chegam à Duttyfy.

---

## 5. Testar o funil sem cobrar

No Railway, mude `GATEWAY_MOCK` para `1` e redeploy. O PIX é gerado falso e você percorre
checkout → upsell → obrigado sem tocar na Duttyfy. Depois volte para `0`.

---

## 6. Domínio próprio

*Service → Settings → Networking → Custom Domain*. Depois atualize a variável
`NEXT_PUBLIC_APP_URL` para o novo domínio e recadastre a URL do webhook na Duttyfy.

# B2B Pre-Auth Terminal

Predautorizačný terminál a API pre B2B firmy:
- **Hold → Approval Code → Capture (čiastočný/plný) / Reauthorize / Void**
- **Procesory:** Simulator, PayPal Orders v2 (`AUTHORIZE`), Stripe (`capture_method=manual`)
- **Bezpečnosť:** PCI-DSS hygiena (blokuje surové PAN/CVV), idempotencia, API Key RBAC (`viewer`, `operator`, `admin`), audit log
- **ERP & Predaj:** CSV/XML exporty, verejný formulár na cenovú ponuku (`POST /api/leads`) a Lead Tracker (`GET/PATCH /api/leads`)

## Lokálne spustenie
```powershell
node src/server.js
# Otvorte http://127.0.0.1:3456
```

## Nasadenie cez Docker (Render / Railway / VPS)
```bash
docker build -t preauth-terminal .
docker run -d -p 3456:3456 -e HOST=0.0.0.0 -e PROCESSOR_MODE=simulator preauth-terminal
```
Pre ostrú prevádzku nastavte v `.env` alebo env premenných hostingu:
- `HOST=0.0.0.0`
- `VIEWER_API_KEY`, `OPERATOR_API_KEY`, `ADMIN_API_KEY`
- `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` a/alebo `STRIPE_SECRET_KEY`

## Pripravené texty na zverejnenie (SK/CZ & EN)

### 1. Webtrh.cz / LinkedIn (SK/CZ)
**Titulok:** Hotový B2B Pre-Auth Terminal (Predautorizácia platieb podľa Approval Code, PayPal + Stripe, ERP exporty)
**Text:**
Ponúkame hotové white-label riešenie na predautorizáciu platieb a kaucí pre požičovne, hotely, veľkoobchody a B2B služby:
- Vytvorenie blokácie (Hold), vyhľadávanie podľa 6-znakového `approvalCode`, čiastočné aj finálne zúčtovanie (`Capture`), predĺženie (`Reauthorize`) a uvoľnenie (`Void`)
- Hromadné (batch) predautorizácie a hromadné zúčtovanie
- Napojenie na PayPal Orders v2 (`AUTHORIZE`) a Stripe (`capture_method=manual`) + lokálny simulátor
- API kľúče s rolami (`viewer`, `operator`, `admin`), audit log a 1-klikový export do CSV/XML pre účtovníctvo
- Zabudovaný formulár na žiadosti o cenovú ponuku a ukážku. Možnosť nasadenia na váš server a úprav na mieru.

### 2. Indie Hackers / Reddit (`r/SaaS`, `r/Entrepreneur`) / Flippa / Acquire (EN)
**Title:** Turnkey B2B Pre-Authorization & Approval-Code Capture Terminal (PayPal + Stripe, Batch Capture, RBAC, CSV/XML ERP Export)
**Body:**
Built a clean, zero-dependency Node.js B2B Pre-Auth Terminal for businesses that need to hold funds/deposits (car rentals, equipment leasing, hotels, wholesale orders) and capture later by approval code or in batches:
- Full lifecycle: `Pre-Auth Hold` -> `Approval Code` lookup -> `Partial/Full Capture`, `Reauthorize`, `Void`
- Adapters: PayPal Orders/Payments v2 (`intent: AUTHORIZE`), Stripe (`capture_method: manual`), and built-in POS/Issuer Simulator
- Security & Ops: PCI-DSS input guard (rejects raw PAN/CVV), idempotency keys, role-based API keys (`viewer`/`operator`/`admin`), immutable audit log, CSV & XML ERP exports, plus built-in Lead/Quote intake (`POST /api/leads`) and Dockerfile.
Available for white-label licensing or full codebase acquisition. DM for a live demo.

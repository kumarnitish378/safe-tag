# SafeTag MCP Server — Design

**Branch:** `feat/mcp-shopping`
**Goal:** An **authenticated remote MCP server** so an AI client (Claude, ChatGPT, Claude Code, etc.) can, on a signed-in user's behalf, **shop for SafeTag products** and **manage their tags** (activate, edit medical/other profiles, see scans).

Ref: Model Context Protocol — https://modelcontextprotocol.io/docs/2026-07-28/getting-started/intro

---

## 1. Architecture

MCP is "USB-C for AI apps": a client (the AI host) connects to our **server**, which exposes **tools** (functions the model calls with user approval) and optionally **resources** (readable data).

- **Transport:** **Streamable HTTP** (remote). We mount an MCP endpoint **inside the existing Express app** at **`POST/GET/DELETE /mcp`**, so it reuses Prisma, the helpers, and the Neon DB — no separate service to deploy.
- **SDK:** `@modelcontextprotocol/sdk` (official TS/Node). The app is CommonJS, so we load it via dynamic `import()` inside an async bootstrap. Tool input schemas use **`zod`**.
- **Session:** the SDK's `StreamableHTTPServerTransport` manages the JSON-RPC session; we create one server instance per authenticated request/session.

```
AI client ──HTTP(+Bearer)──▶  Express  /mcp  ──▶ StreamableHTTPServerTransport
                                                   └▶ McpServer (tools)
                                                        └▶ Prisma / helpers ──▶ Neon
```

New files:
```
lib/mcp/
  server.js        # buildMcpServer(ctx) → McpServer with all tools registered
  auth.js          # Bearer-token middleware → resolves token to a user
  tools/
    shopping.js    # list_products, get_product, create_order, ...
    tags.js        # list_my_tags, get_tag, activate_tag, update_*_profile, ...
server.js          # mounts app.all('/mcp', mcpAuth, mcpHandler)
```

## 2. Authentication (the key decision)

Every tool acts **as a specific user**, so the connection must be authenticated and every query scoped to that user (we already do IDOR-safe scoping everywhere).

**Option A — Personal Access Token (PAT) — recommended for v1**
- User opens **Dashboard → Connections** and clicks **"Create MCP token"**. We show the raw token **once**; store only its SHA-256 hash (same pattern as password-reset tokens).
- The MCP client sends it as `Authorization: Bearer <token>`. Middleware hashes it, looks up the (non-revoked) token, loads the user, and attaches `ctx.user`.
- **Pros:** ships fast, secure, revocable, works with any client that allows a custom header (Claude Code, custom agents, MCPJam). **Cons:** first-party connector UIs (Claude/ChatGPT "Add connector") expect OAuth, so those would need the header pasted or wait for Option B.

**Option B — OAuth 2.1 (MCP Authorization) — v2**
- Implement the MCP auth spec: our server is an OAuth **Resource Server** advertising `WWW-Authenticate`, with an **Authorization Server** (metadata endpoints, dynamic client registration, PKCE, the existing login as the consent step).
- **Pros:** one-click "Add connector" in Claude/ChatGPT; no token pasting. **Cons:** substantially more work.

> **Proposal:** build **Option A now** (fast, fully functional), architected so **Option B** slots in later without changing the tools. New model:
> ```prisma
> model ApiToken {
>   id         Int      @id @default(autoincrement())
>   userId     Int      @map("user_id")
>   tokenHash  String   @unique @map("token_hash")
>   name       String
>   lastUsedAt DateTime? @map("last_used_at")
>   createdAt  DateTime @default(now()) @map("created_at")
>   revokedAt  DateTime? @map("revoked_at")
>   user       User     @relation(fields: [userId], references: [id])
>   @@map("api_tokens")
> }
> ```

## 3. Tools

All **write** tools are marked and the client asks the user to approve each call. Every tool scopes to `ctx.user`.

**Shopping**
| Tool | Kind | Description |
|---|---|---|
| `list_products` | read | Approved store listings (name, price ₹, category, stock). |
| `get_product` | read | One product's full detail. |
| `create_order` | **write** | Place an order for a product+qty to a shipping address. **COD** → placed immediately; **online** → returns a **Razorpay Payment Link** URL to complete payment (no card data touches the model). Reuses `createStoreOrder()`. |
| `list_my_orders` / `get_order` | read | The user's orders + status/tracking. |

**Tag management**
| Tool | Kind | Description |
|---|---|---|
| `list_my_tags` | read | The user's tags (id, type, active, scans). |
| `get_tag` | read | One tag + its profile + scan URL. |
| `activate_tag` | **write** | Activate an unactivated tag the user holds (by code+security key), choosing type for Universal. |
| `update_medical_profile` | **write** | Edit the medical profile (blood group, allergies, contacts…). |
| `update_tag_profile` | **write** | Edit a non-medical type profile (vcard, pet, …) via the type registry. |

**Resource (optional):** `safetag://catalog` — the product catalog as a readable resource.

## 4. Payments over MCP

The model can't render the Razorpay modal, so:
- **COD:** `create_order` places the order directly (as the web COD path does).
- **Online:** create a **Razorpay Payment Link** (Payment Links API) and return its short URL; the webhook we already have marks it paid. The AI replies: *"Order created — pay here: &lt;link&gt;."*

## 5. Security
- Bearer token hashed at rest, revocable, `lastUsedAt` tracked; shown once.
- Every tool re-uses the **ownership-scoped** Prisma queries (no IDOR).
- A dedicated **rate limiter** on `/mcp`.
- Read vs write tools clearly separated; write tools rely on the client's per-call user approval.
- No secrets (Razorpay keys, etc.) ever returned to the model.
- Tokens carry a `safetag:shop` / `safetag:tags` scope field for future least-privilege.

## 6. Implementation phases
- **Phase 1 (v1):** deps (`@modelcontextprotocol/sdk`, `zod`) · `ApiToken` model (local + Neon) · Bearer auth · `/mcp` endpoint · **read tools** (`list_products`, `get_product`, `list_my_tags`, `get_tag`, `list_my_orders`) · Dashboard token UI.
- **Phase 2:** **write tools** (`create_order` w/ COD + payment link, `activate_tag`, `update_medical_profile`, `update_tag_profile`).
- **Phase 3:** **OAuth 2.1** authorization for one-click connector support.

## 7. Testing
- Unit tests for token hashing/lookup + each tool handler (scoped to a seeded user).
- An MCP smoke test (initialize → tools/list → call a read tool) via the SDK client or `curl` JSON-RPC.
- Manual connect from Claude Code / MCPJam using a generated PAT.

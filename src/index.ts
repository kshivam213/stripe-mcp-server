import { randomUUID } from "node:crypto";
import http from "node:http";
import express from "express";
import Stripe from "stripe";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const stripe = new Stripe(process.env.STRIPE_API_KEY!, {
  apiVersion: "2025-02-24.acacia",
});

function createMcpServer() {
  const mcp = new McpServer({
    name: "stripe-mcp",
    version: "0.1.0",
  });

  // ── Customers ──────────────────────────────────────────────────────────────

  mcp.registerTool(
    "create_customer",
    {
      description: "Create a new Stripe customer",
      inputSchema: {
        email: z.string().email().optional(),
        name: z.string().optional(),
        phone: z.string().optional(),
        description: z.string().optional(),
      },
    },
    async (input) => {
      const customer = await stripe.customers.create(input);
      return { content: [{ type: "text", text: JSON.stringify(customer, null, 2) }] };
    }
  );

  mcp.registerTool(
    "retrieve_customer",
    {
      description: "Retrieve a Stripe customer by ID",
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      const customer = await stripe.customers.retrieve(id);
      return { content: [{ type: "text", text: JSON.stringify(customer, null, 2) }] };
    }
  );

  mcp.registerTool(
    "list_customers",
    {
      description: "List Stripe customers",
      inputSchema: {
        limit: z.number().int().min(1).max(100).default(10),
        email: z.string().email().optional(),
      },
    },
    async (input) => {
      const customers = await stripe.customers.list(input);
      return { content: [{ type: "text", text: JSON.stringify(customers, null, 2) }] };
    }
  );

  mcp.registerTool(
    "update_customer",
    {
      description: "Update a Stripe customer",
      inputSchema: {
        id: z.string(),
        email: z.string().email().optional(),
        name: z.string().optional(),
        phone: z.string().optional(),
        description: z.string().optional(),
      },
    },
    async ({ id, ...params }) => {
      const customer = await stripe.customers.update(id, params);
      return { content: [{ type: "text", text: JSON.stringify(customer, null, 2) }] };
    }
  );

  // ── Payment Intents ────────────────────────────────────────────────────────

  mcp.registerTool(
    "create_payment_intent",
    {
      description: "Create a Stripe payment intent",
      inputSchema: {
        amount: z.number().int().positive().describe("Amount in smallest currency unit (e.g. cents)"),
        currency: z.string().length(3).describe("3-letter ISO currency code"),
        customer: z.string().optional(),
        description: z.string().optional(),
        metadata: z.record(z.string()).optional(),
      },
    },
    async (input) => {
      const pi = await stripe.paymentIntents.create(input as Stripe.PaymentIntentCreateParams);
      return { content: [{ type: "text", text: JSON.stringify(pi, null, 2) }] };
    }
  );

  mcp.registerTool(
    "retrieve_payment_intent",
    {
      description: "Retrieve a Stripe payment intent by ID",
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      const pi = await stripe.paymentIntents.retrieve(id);
      return { content: [{ type: "text", text: JSON.stringify(pi, null, 2) }] };
    }
  );

  // ── Invoices ───────────────────────────────────────────────────────────────

  mcp.registerTool(
    "create_invoice",
    {
      description: "Create a Stripe invoice for a customer",
      inputSchema: {
        customer: z.string(),
        description: z.string().optional(),
        auto_advance: z.boolean().default(false),
      },
    },
    async (input) => {
      const invoice = await stripe.invoices.create(input as Stripe.InvoiceCreateParams);
      return { content: [{ type: "text", text: JSON.stringify(invoice, null, 2) }] };
    }
  );

  mcp.registerTool(
    "retrieve_invoice",
    {
      description: "Retrieve a Stripe invoice by ID",
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      const invoice = await stripe.invoices.retrieve(id);
      return { content: [{ type: "text", text: JSON.stringify(invoice, null, 2) }] };
    }
  );

  mcp.registerTool(
    "list_invoices",
    {
      description: "List Stripe invoices",
      inputSchema: {
        customer: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(10),
        status: z.enum(["draft", "open", "paid", "uncollectible", "void"]).optional(),
      },
    },
    async (input) => {
      const invoices = await stripe.invoices.list(input as Stripe.InvoiceListParams);
      return { content: [{ type: "text", text: JSON.stringify(invoices, null, 2) }] };
    }
  );

  // ── Subscriptions ──────────────────────────────────────────────────────────

  mcp.registerTool(
    "create_subscription",
    {
      description: "Create a Stripe subscription for a customer",
      inputSchema: {
        customer: z.string(),
        items: z.array(z.object({ price: z.string() })).min(1),
        trial_period_days: z.number().int().positive().optional(),
        metadata: z.record(z.string()).optional(),
      },
    },
    async (input) => {
      const sub = await stripe.subscriptions.create(input as Stripe.SubscriptionCreateParams);
      return { content: [{ type: "text", text: JSON.stringify(sub, null, 2) }] };
    }
  );

  mcp.registerTool(
    "retrieve_subscription",
    {
      description: "Retrieve a Stripe subscription by ID",
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      const sub = await stripe.subscriptions.retrieve(id);
      return { content: [{ type: "text", text: JSON.stringify(sub, null, 2) }] };
    }
  );

  mcp.registerTool(
    "list_subscriptions",
    {
      description: "List Stripe subscriptions",
      inputSchema: {
        customer: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(10),
        status: z
          .enum(["active", "past_due", "unpaid", "canceled", "incomplete", "incomplete_expired", "trialing", "all"])
          .optional(),
      },
    },
    async (input) => {
      const subs = await stripe.subscriptions.list(input as Stripe.SubscriptionListParams);
      return { content: [{ type: "text", text: JSON.stringify(subs, null, 2) }] };
    }
  );

  mcp.registerTool(
    "cancel_subscription",
    {
      description: "Cancel a Stripe subscription",
      inputSchema: {
        id: z.string(),
        cancel_at_period_end: z.boolean().default(false).describe("If true, cancels at end of current billing period"),
      },
    },
    async ({ id, cancel_at_period_end }) => {
      const sub = cancel_at_period_end
        ? await stripe.subscriptions.update(id, { cancel_at_period_end: true })
        : await stripe.subscriptions.cancel(id);
      return { content: [{ type: "text", text: JSON.stringify(sub, null, 2) }] };
    }
  );

  return mcp;
}

// ── HTTP server with per-request stateless transport ───────────────────────

const app = express();
app.use(express.json());

// Map of session transports for stateful connections
const sessions = new Map<string, StreamableHTTPServerTransport>();

app.all("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  // Re-use existing session
  if (sessionId && sessions.has(sessionId)) {
    await sessions.get(sessionId)!.handleRequest(req, res, req.body);
    return;
  }

  // New session or stateless request
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (id) => {
      sessions.set(id, transport);
    },
  });

  transport.onclose = () => {
    if (transport.sessionId) sessions.delete(transport.sessionId);
  };

  const mcp = createMcpServer();
  await mcp.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", sessions: sessions.size });
});

const PORT = Number(process.env.PORT ?? 3000);
const server = http.createServer(app);
server.listen(PORT, "0.0.0.0", () => {
  console.log(`stripe-mcp listening on port ${PORT}`);
});

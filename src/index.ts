import express, { Request, Response, NextFunction } from "express";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_API_KEY!, {
  apiVersion: "2025-02-24.acacia",
});

const app = express();
app.use(express.json());

// ── Tool definitions ──────────────────────────────────────────────────────────

type Tool = {
  name: string;
  description: string;
  inputSchema: object;
  handler: (args: Record<string, any>) => Promise<unknown>;
};

const tools: Tool[] = [
  {
    name: "create_customer",
    description: "Create a new Stripe customer",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", format: "email", description: "Customer email address" },
        name: { type: "string", description: "Customer full name" },
      },
      required: ["email"],
    },
    handler: async (args) => stripe.customers.create(args),
  },
  {
    name: "list_customers",
    description: "List customers, optionally filtered by email",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Number of customers to return (default 10)" },
        email: { type: "string", description: "Filter by email address" },
      },
    },
    handler: async ({ limit = 10, email }) =>
      stripe.customers.list({ limit: Number(limit), ...(email && { email }) }),
  },
  {
    name: "get_customer",
    description: "Retrieve a customer by their Stripe ID",
    inputSchema: {
      type: "object",
      properties: {
        customer_id: { type: "string", description: "Stripe customer ID (cus_...)" },
      },
      required: ["customer_id"],
    },
    handler: async ({ customer_id }) => stripe.customers.retrieve(customer_id),
  },
  {
    name: "update_customer",
    description: "Update an existing customer's details",
    inputSchema: {
      type: "object",
      properties: {
        customer_id: { type: "string", description: "Stripe customer ID (cus_...)" },
        name: { type: "string", description: "New name" },
        email: { type: "string", format: "email", description: "New email" },
      },
      required: ["customer_id"],
    },
    handler: async ({ customer_id, ...rest }) => stripe.customers.update(customer_id, rest),
  },
  {
    name: "list_payment_intents",
    description: "List recent payment intents, optionally filtered by customer",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Number of results (default 10)" },
        customer_id: { type: "string", description: "Filter by customer ID" },
      },
    },
    handler: async ({ limit = 10, customer_id }) =>
      stripe.paymentIntents.list({ limit: Number(limit), ...(customer_id && { customer: customer_id }) }),
  },
  {
    name: "get_payment_intent",
    description: "Retrieve a specific payment intent by ID",
    inputSchema: {
      type: "object",
      properties: {
        payment_id: { type: "string", description: "Stripe payment intent ID (pi_...)" },
      },
      required: ["payment_id"],
    },
    handler: async ({ payment_id }) => stripe.paymentIntents.retrieve(payment_id),
  },
  {
    name: "create_refund",
    description: "Refund a payment intent, fully or partially",
    inputSchema: {
      type: "object",
      properties: {
        payment_id: { type: "string", description: "Stripe payment intent ID to refund" },
        amount: { type: "number", description: "Amount in cents (omit for full refund)" },
        reason: { type: "string", description: "duplicate | fraudulent | requested_by_customer" },
      },
      required: ["payment_id"],
    },
    handler: async ({ payment_id, amount, reason }) =>
      stripe.refunds.create({
        payment_intent: payment_id,
        ...(amount && { amount: Number(amount) }),
        ...(reason && { reason }),
      }),
  },
  {
    name: "list_invoices",
    description: "List invoices, optionally filtered by customer or status",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Number of results (default 10)" },
        customer_id: { type: "string", description: "Filter by customer ID" },
        status: { type: "string", description: "draft | open | paid | uncollectible | void" },
      },
    },
    handler: async ({ limit = 10, customer_id, status }) =>
      stripe.invoices.list({
        limit: Number(limit),
        ...(customer_id && { customer: customer_id }),
        ...(status && { status: status as Stripe.InvoiceListParams.Status }),
      }),
  },
  {
    name: "get_invoice",
    description: "Retrieve a specific invoice by ID",
    inputSchema: {
      type: "object",
      properties: {
        invoice_id: { type: "string", description: "Stripe invoice ID (in_...)" },
      },
      required: ["invoice_id"],
    },
    handler: async ({ invoice_id }) => stripe.invoices.retrieve(invoice_id),
  },
  {
    name: "list_subscriptions",
    description: "List subscriptions, optionally filtered by customer or status",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Number of results (default 10)" },
        customer_id: { type: "string", description: "Filter by customer ID" },
        status: { type: "string", description: "active | canceled | incomplete | past_due | trialing | unpaid" },
      },
    },
    handler: async ({ limit = 10, customer_id, status }) =>
      stripe.subscriptions.list({
        limit: Number(limit),
        ...(customer_id && { customer: customer_id }),
        ...(status && { status: status as Stripe.SubscriptionListParams.Status }),
      }),
  },
  {
    name: "cancel_subscription",
    description: "Cancel a subscription immediately or at period end",
    inputSchema: {
      type: "object",
      properties: {
        subscription_id: { type: "string", description: "Stripe subscription ID (sub_...)" },
        cancel_at_period_end: { type: "boolean", description: "If true, cancel at end of billing period" },
      },
      required: ["subscription_id"],
    },
    handler: async ({ subscription_id, cancel_at_period_end }) =>
      cancel_at_period_end === true
        ? stripe.subscriptions.update(subscription_id, { cancel_at_period_end: true })
        : stripe.subscriptions.cancel(subscription_id),
  },
];

const toolMap = new Map(tools.map((t) => [t.name, t]));

// ── GET /tools ────────────────────────────────────────────────────────────────

app.get("/tools", (_req: Request, res: Response) => {
  res.json(tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })));
});

// ── POST /:toolName/call ──────────────────────────────────────────────────────

app.post("/tools/:toolName/call", async (req: Request<{ toolName: string }>, res: Response, next: NextFunction) => {
  const tool = toolMap.get(req.params.toolName);
  if (!tool) {
    res.status(404).json({ error: `Tool '${req.params.toolName}' not found` });
    return;
  }
  try {
    const result = await tool.handler(req.body.arguments ?? {});
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ── Health ────────────────────────────────────────────────────────────────────

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

// ── Error handler ─────────────────────────────────────────────────────────────

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof Stripe.errors.StripeError) {
    res.status(err.statusCode ?? 400).json({ error: err.message, type: err.type });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

const PORT = Number(process.env.PORT ?? 3000);
app.listen(PORT, "0.0.0.0", () => {
  console.log(`stripe-mcp listening on port ${PORT}`);
});

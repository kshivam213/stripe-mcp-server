import express, { Request, Response, NextFunction } from "express";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_API_KEY!, {
  apiVersion: "2025-02-24.acacia",
});

const app = express();
app.use(express.json());

// ── Customers ──────────────────────────────────────────────────────────────

app.post("/customers", async (req: Request, res: Response) => {
  const customer = await stripe.customers.create(req.body);
  res.json(customer);
});

app.get("/customers", async (req: Request, res: Response) => {
  const { limit = "10", email } = req.query as Record<string, string>;
  const customers = await stripe.customers.list({
    limit: Number(limit),
    ...(email && { email }),
  });
  res.json(customers);
});

app.get("/customers/:id", async (req: Request<{ id: string }>, res: Response) => {
  const customer = await stripe.customers.retrieve(req.params.id);
  res.json(customer);
});

app.patch("/customers/:id", async (req: Request<{ id: string }>, res: Response) => {
  const customer = await stripe.customers.update(req.params.id, req.body);
  res.json(customer);
});

// ── Payment Intents ────────────────────────────────────────────────────────

app.post("/payment-intents", async (req: Request, res: Response) => {
  const pi = await stripe.paymentIntents.create(req.body);
  res.json(pi);
});

app.get("/payment-intents/:id", async (req: Request<{ id: string }>, res: Response) => {
  const pi = await stripe.paymentIntents.retrieve(req.params.id);
  res.json(pi);
});

// ── Invoices ───────────────────────────────────────────────────────────────

app.post("/invoices", async (req: Request, res: Response) => {
  const invoice = await stripe.invoices.create(req.body);
  res.json(invoice);
});

app.get("/invoices", async (req: Request, res: Response) => {
  const { limit = "10", customer, status } = req.query as Record<string, string>;
  const invoices = await stripe.invoices.list({
    limit: Number(limit),
    ...(customer && { customer }),
    ...(status && { status: status as Stripe.InvoiceListParams.Status }),
  });
  res.json(invoices);
});

app.get("/invoices/:id", async (req: Request<{ id: string }>, res: Response) => {
  const invoice = await stripe.invoices.retrieve(req.params.id);
  res.json(invoice);
});

// ── Subscriptions ──────────────────────────────────────────────────────────

app.post("/subscriptions", async (req: Request, res: Response) => {
  const sub = await stripe.subscriptions.create(req.body);
  res.json(sub);
});

app.get("/subscriptions", async (req: Request, res: Response) => {
  const { limit = "10", customer, status } = req.query as Record<string, string>;
  const subs = await stripe.subscriptions.list({
    limit: Number(limit),
    ...(customer && { customer }),
    ...(status && { status: status as Stripe.SubscriptionListParams.Status }),
  });
  res.json(subs);
});

app.get("/subscriptions/:id", async (req: Request<{ id: string }>, res: Response) => {
  const sub = await stripe.subscriptions.retrieve(req.params.id);
  res.json(sub);
});

app.delete("/subscriptions/:id", async (req: Request<{ id: string }>, res: Response) => {
  const { cancel_at_period_end } = req.query;
  const sub =
    cancel_at_period_end === "true"
      ? await stripe.subscriptions.update(req.params.id, { cancel_at_period_end: true })
      : await stripe.subscriptions.cancel(req.params.id);
  res.json(sub);
});

// ── Health ─────────────────────────────────────────────────────────────────

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

// ── Error handler ──────────────────────────────────────────────────────────

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

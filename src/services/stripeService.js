const Stripe = require("stripe");

function getStripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    return null;
  }

  return new Stripe(key, {
    apiVersion: "2025-06-30.basil"
  });
}

function getStripeConfig() {
  return {
    enabled: Boolean(process.env.STRIPE_SECRET_KEY),
    hasWebhookSecret: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    publishableKeyConfigured: Boolean(process.env.STRIPE_PUBLISHABLE_KEY)
  };
}

async function createCheckoutSession({ proposal, product, customerEmail }) {
  const stripe = getStripeClient();

  if (!stripe) {
    return {
      provider: "mock",
      sessionId: `mock_${Date.now()}`,
      url: `https://checkout.stripe.com/pay/${encodeURIComponent(product.id)}-${Date.now()}`
    };
  }

  const successUrl = process.env.STRIPE_SUCCESS_URL || "http://localhost:4000/proposals.html?payment=success";
  const cancelUrl = process.env.STRIPE_CANCEL_URL || "http://localhost:4000/proposals.html?payment=cancel";

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    success_url: successUrl,
    cancel_url: cancelUrl,
    customer_email: customerEmail || undefined,
    metadata: {
      proposalId: proposal.id,
      productId: product.id
    },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: Math.round(Number(proposal.total || product.priceFrom) * 100),
          product_data: {
            name: product.name,
            description: proposal.scope || product.description
          }
        }
      }
    ]
  });

  return {
    provider: "stripe",
    sessionId: session.id,
    url: session.url
  };
}

function verifyWebhook(rawBody, signature) {
  const stripe = getStripeClient();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripe || !secret) {
    return null;
  }

  return stripe.webhooks.constructEvent(rawBody, signature, secret);
}

module.exports = {
  getStripeConfig,
  createCheckoutSession,
  verifyWebhook
};

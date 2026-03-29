import Stripe from 'stripe';

function createStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    // Return a mock-safe instance for build time / dev without keys
    return new Stripe('sk_test_placeholder', {
      apiVersion: '2026-03-25.dahlia',
    });
  }
  return new Stripe(key, {
    apiVersion: '2026-03-25.dahlia',
  });
}

export const stripe = createStripeClient();

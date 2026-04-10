import { secureFetch } from "@/lib/csrf";
import { loadStripe } from "@stripe/stripe-js";

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY || "");

export async function redirectToCheckout(priceId: string, workspaceId: string, tier?: string) {
  const stripe = await stripePromise;
  if (!stripe) throw new Error("Stripe not loaded");

  const response = await secureFetch("/api/billing/create-checkout-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 
      priceId,
      tier: tier || "enterprise",
      workspaceId,
      successUrl: `${window.location.origin}/billing?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${window.location.origin}/billing`,
    }),
  });

  const session = await response.json();
  if (session.error) throw new Error(session.error);

  // @ts-expect-error — TS migration: fix in refactoring sprint
  const result = await stripe.redirectToCheckout({ sessionId: session.sessionId });
  if (result.error) throw new Error(result.error.message);
}

export async function createPaymentIntent(amount: number, workspaceId: string) {
  const response = await secureFetch("/api/billing/create-payment-intent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount, workspaceId }),
  });

  const data = await response.json();
  if (data.error) throw new Error(data.error);
  return data;
}

export async function verifyPaymentStatus(workspaceId: string) {
  const response = await secureFetch(`/api/billing/verify-payment/${workspaceId}`);
  const data = await response.json();
  return data;
}

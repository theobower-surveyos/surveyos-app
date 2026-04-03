// SurveyOS Stripe Client Utilities
// Calls Supabase Edge Functions for all Stripe operations.
// No Stripe SDK on the client — all sensitive logic lives server-side.

import { supabase } from '../supabaseClient';

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
  : `${supabase.supabaseUrl}/functions/v1`;

async function callEdgeFunction(name, body) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`${FUNCTIONS_URL}/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Edge function ${name} failed`);
  return data;
}

// Initiate Stripe Connect onboarding for the firm
// Returns { url, stripe_account_id }
export async function startConnectOnboarding(returnUrl) {
  return callEdgeFunction('stripe-connect-onboard', {
    return_url: returnUrl || window.location.origin,
  });
}

// Create an invoice + Stripe Checkout Session
// Returns { invoice_id, invoice_number, checkout_url, total_cents, platform_fee_cents, take_rate }
export async function createInvoice({ projectId, clientName, clientEmail, clientCompany, lineItems, dueDate, notes }) {
  return callEdgeFunction('stripe-create-invoice', {
    project_id: projectId,
    client_name: clientName,
    client_email: clientEmail || null,
    client_company: clientCompany || null,
    line_items: lineItems,
    due_date: dueDate || null,
    notes: notes || null,
  });
}

// Check if the firm has completed Stripe Connect onboarding
export async function getConnectStatus() {
  const { data, error } = await supabase
    .from('stripe_accounts')
    .select('stripe_account_id, onboarding_status, charges_enabled, payouts_enabled, default_take_rate')
    .limit(1)
    .single();

  if (error || !data) return { connected: false, status: 'not_started' };

  return {
    connected: data.charges_enabled && data.payouts_enabled,
    status: data.onboarding_status,
    chargesEnabled: data.charges_enabled,
    payoutsEnabled: data.payouts_enabled,
    takeRate: data.default_take_rate,
    stripeAccountId: data.stripe_account_id,
  };
}

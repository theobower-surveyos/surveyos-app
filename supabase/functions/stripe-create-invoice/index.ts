// ================================================================
// STRIPE INVOICE & CHECKOUT SESSION CREATION
// ================================================================
// Creates an invoice record in the DB and a Stripe Checkout Session
// with the platform's take rate routed via application_fee_amount.
//
// POST /functions/v1/stripe-create-invoice
// Auth: Supabase JWT (owner, admin, or pm role required)
// Body: {
//   project_id: string,
//   client_name: string,
//   client_email?: string,
//   client_company?: string,
//   line_items: [{ description: string, quantity: number, unit_price_cents: number }],
//   due_date?: string (ISO date),
//   notes?: string,
// }
// Returns: { invoice_id: string, checkout_url: string }
// ================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { stripe } from '../_shared/stripe.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Authenticate
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return errorResponse(401, 'Missing authorization header');

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) return errorResponse(401, 'Invalid or expired token');

    // 2. Verify role
    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('firm_id, role')
      .eq('id', user.id)
      .single();

    if (!profile || !['owner', 'admin', 'pm'].includes(profile.role)) {
      return errorResponse(403, 'Insufficient permissions to create invoices');
    }

    const firmId = profile.firm_id;

    // 3. Parse request body
    const body = await req.json();
    const { project_id, client_name, client_email, client_company, line_items, due_date, notes } = body;

    if (!project_id || !client_name || !line_items?.length) {
      return errorResponse(400, 'Missing required fields: project_id, client_name, line_items');
    }

    // 4. Verify project belongs to this firm
    const { data: project, error: projError } = await supabaseAdmin
      .from('projects')
      .select('id, project_name, firm_id')
      .eq('id', project_id)
      .eq('firm_id', firmId)
      .single();

    if (projError || !project) {
      return errorResponse(404, 'Project not found or does not belong to your firm');
    }

    // 5. Get the firm's Stripe Connect account
    const { data: stripeAccount } = await supabaseAdmin
      .from('stripe_accounts')
      .select('stripe_account_id, charges_enabled, default_take_rate')
      .eq('firm_id', firmId)
      .single();

    if (!stripeAccount?.stripe_account_id) {
      return errorResponse(400, 'Firm has not connected a Stripe account. Complete onboarding first.');
    }

    if (!stripeAccount.charges_enabled) {
      return errorResponse(400, 'Stripe account onboarding is incomplete. Charges are not yet enabled.');
    }

    // 6. Calculate financials (all in cents)
    const subtotalCents = line_items.reduce(
      (sum: number, item: { quantity: number; unit_price_cents: number }) =>
        sum + item.quantity * item.unit_price_cents,
      0,
    );
    const taxCents = 0; // Tax calculation can be added later
    const totalCents = subtotalCents + taxCents;

    // THE TAKE RATE: Platform captures 2.5-3.0% of GTV
    // Uses the firm's configured rate (default 2.75%)
    const takeRate = Number(stripeAccount.default_take_rate) || 0.0275;
    const platformFeeCents = Math.round(totalCents * takeRate);

    // 7. Generate invoice number: PREFIX-YEAR-SEQ
    const { data: firm } = await supabaseAdmin
      .from('firms')
      .select('invoice_prefix, invoice_next_seq, name')
      .eq('id', firmId)
      .single();

    const prefix = firm?.invoice_prefix || firm?.name?.substring(0, 3).toUpperCase() || 'SOS';
    const seq = firm?.invoice_next_seq || 1;
    const year = new Date().getFullYear();
    const invoiceNumber = `${prefix}-${year}-${String(seq).padStart(5, '0')}`;

    // Increment the sequence counter
    await supabaseAdmin
      .from('firms')
      .update({ invoice_next_seq: seq + 1 })
      .eq('id', firmId);

    // 8. Create Stripe Checkout Session with application_fee_amount
    const origin = Deno.env.get('SITE_URL') || 'https://surveyos.app';

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: line_items.map((item: { description: string; quantity: number; unit_price_cents: number }) => ({
        price_data: {
          currency: 'usd',
          unit_amount: item.unit_price_cents,
          product_data: {
            name: item.description,
            metadata: { project_id, invoice_number: invoiceNumber },
          },
        },
        quantity: item.quantity,
      })),
      // THE CORE FINTECH MECHANISM:
      // application_fee_amount routes our platform cut to the SurveyOS account.
      // The remainder goes to the connected firm's account via transfer_data.
      payment_intent_data: {
        application_fee_amount: platformFeeCents,
        transfer_data: {
          destination: stripeAccount.stripe_account_id,
        },
        metadata: {
          surveyos_invoice_number: invoiceNumber,
          surveyos_project_id: project_id,
          surveyos_firm_id: firmId,
        },
      },
      customer_email: client_email || undefined,
      success_url: `${origin}/?share=${project_id}&paid=true`,
      cancel_url: `${origin}/?share=${project_id}`,
      metadata: {
        surveyos_invoice_number: invoiceNumber,
        surveyos_project_id: project_id,
        surveyos_firm_id: firmId,
      },
    });

    // 9. Insert the invoice record
    const { data: invoice, error: insertError } = await supabaseAdmin
      .from('invoices')
      .insert({
        firm_id: firmId,
        project_id,
        invoice_number: invoiceNumber,
        subtotal_cents: subtotalCents,
        tax_cents: taxCents,
        total_cents: totalCents,
        platform_fee_cents: platformFeeCents,
        status: 'sent',
        due_date: due_date || null,
        sent_at: new Date().toISOString(),
        stripe_checkout_session_id: session.id,
        checkout_url: session.url,
        client_name,
        client_email: client_email || null,
        client_company: client_company || null,
        line_items,
        notes: notes || null,
        created_by: user.id,
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('Invoice insert error:', insertError);
      return errorResponse(500, 'Failed to create invoice record');
    }

    return new Response(
      JSON.stringify({
        invoice_id: invoice.id,
        invoice_number: invoiceNumber,
        checkout_url: session.url,
        total_cents: totalCents,
        platform_fee_cents: platformFeeCents,
        take_rate: takeRate,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );
  } catch (err) {
    console.error('stripe-create-invoice error:', err);
    return errorResponse(500, err.message || 'Internal server error');
  }
});

function errorResponse(status: number, message: string) {
  return new Response(
    JSON.stringify({ error: message }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status },
  );
}

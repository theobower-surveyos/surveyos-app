// ================================================================
// STRIPE WEBHOOK HANDLER
// ================================================================
// Receives events from Stripe and updates the database.
// NO authentication — verified via Stripe webhook signature.
//
// POST /functions/v1/stripe-webhook
// Auth: NONE (public endpoint, signature-verified)
// Body: Raw Stripe event payload
//
// Events handled:
//   checkout.session.completed  → Invoice paid, insert payment record
//   account.updated             → Update Connect onboarding status
//   charge.refunded             → Mark payment as refunded
// ================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { stripe } from '../_shared/stripe.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';

const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Verify the webhook signature
    const body = await req.text();
    const signature = req.headers.get('stripe-signature');

    if (!signature) {
      return new Response('Missing stripe-signature header', { status: 400 });
    }

    let event;
    try {
      event = await stripe.webhooks.constructEventAsync(
        body,
        signature,
        WEBHOOK_SECRET,
      );
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return new Response(`Webhook Error: ${err.message}`, { status: 400 });
    }

    // 2. Route the event
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutComplete(event.data.object);
        break;

      case 'account.updated':
        await handleAccountUpdated(event.data.object);
        break;

      case 'charge.refunded':
        await handleChargeRefunded(event.data.object);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (err) {
    console.error('stripe-webhook error:', err);
    return new Response(`Webhook handler error: ${err.message}`, { status: 500 });
  }
});

// ================================================================
// EVENT HANDLERS
// ================================================================

async function handleCheckoutComplete(session: any) {
  const sessionId = session.id;
  const paymentIntentId = session.payment_intent;
  const metadata = session.metadata || {};
  const projectId = metadata.surveyos_project_id;
  const firmId = metadata.surveyos_firm_id;

  // 1. Find the invoice by checkout session ID
  const { data: invoice, error } = await supabaseAdmin
    .from('invoices')
    .select('id, total_cents, platform_fee_cents, firm_id, project_id')
    .eq('stripe_checkout_session_id', sessionId)
    .single();

  if (error || !invoice) {
    console.error('Invoice not found for session:', sessionId);
    return;
  }

  // 2. Update invoice status to paid
  await supabaseAdmin
    .from('invoices')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      stripe_payment_intent_id: paymentIntentId,
    })
    .eq('id', invoice.id);

  // 3. Retrieve the PaymentIntent for charge details
  let chargeId = null;
  let transferId = null;
  let stripeFee = null;
  let cardBrand = null;
  let cardLast4 = null;
  let paymentMethod = 'card';

  if (paymentIntentId) {
    try {
      const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
        expand: ['latest_charge', 'latest_charge.balance_transaction'],
      });

      const charge = pi.latest_charge as any;
      if (charge) {
        chargeId = charge.id;
        transferId = charge.transfer || null;
        cardBrand = charge.payment_method_details?.card?.brand || null;
        cardLast4 = charge.payment_method_details?.card?.last4 || null;
        paymentMethod = charge.payment_method_details?.type || 'card';

        // Extract Stripe's processing fee from balance transaction
        if (charge.balance_transaction?.fee) {
          stripeFee = charge.balance_transaction.fee;
        }
      }
    } catch (err) {
      console.error('Failed to retrieve PaymentIntent details:', err.message);
    }
  }

  // 4. Calculate net to firm
  const netToFirm = invoice.total_cents - invoice.platform_fee_cents - (stripeFee || 0);

  // 5. Insert immutable payment record
  await supabaseAdmin.from('payments').insert({
    invoice_id: invoice.id,
    firm_id: invoice.firm_id,
    amount_cents: invoice.total_cents,
    platform_fee_cents: invoice.platform_fee_cents,
    stripe_fee_cents: stripeFee,
    net_to_firm_cents: netToFirm > 0 ? netToFirm : 0,
    stripe_payment_intent_id: paymentIntentId,
    stripe_charge_id: chargeId,
    stripe_transfer_id: transferId,
    status: 'succeeded',
    payment_method: paymentMethod,
    card_brand: cardBrand,
    card_last4: cardLast4,
  });

  // 6. Update project status if applicable
  if (invoice.project_id) {
    await supabaseAdmin
      .from('projects')
      .update({
        invoice_status: 'paid',
        invoice_amount: invoice.total_cents / 100,
      })
      .eq('id', invoice.project_id);
  }

  console.log(`Payment recorded: Invoice ${invoice.id}, $${(invoice.total_cents / 100).toFixed(2)}, Platform fee: $${(invoice.platform_fee_cents / 100).toFixed(2)}`);
}

async function handleAccountUpdated(account: any) {
  const stripeAccountId = account.id;

  // Update the local record with current account status
  const { error } = await supabaseAdmin
    .from('stripe_accounts')
    .update({
      onboarding_status: account.details_submitted ? 'complete' : 'incomplete',
      charges_enabled: account.charges_enabled || false,
      payouts_enabled: account.payouts_enabled || false,
      capabilities: account.capabilities || {},
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_account_id', stripeAccountId);

  if (error) {
    console.error('Failed to update stripe_accounts:', error);
  } else {
    console.log(`Account ${stripeAccountId}: charges=${account.charges_enabled}, payouts=${account.payouts_enabled}`);
  }
}

async function handleChargeRefunded(charge: any) {
  const paymentIntentId = charge.payment_intent;
  if (!paymentIntentId) return;

  // Mark the payment as refunded
  const { error } = await supabaseAdmin
    .from('payments')
    .update({ status: 'refunded' })
    .eq('stripe_payment_intent_id', paymentIntentId);

  if (error) {
    console.error('Failed to update payment for refund:', error);
  }

  // Also update the invoice
  await supabaseAdmin
    .from('invoices')
    .update({ status: 'void', voided_at: new Date().toISOString() })
    .eq('stripe_payment_intent_id', paymentIntentId);

  console.log(`Refund processed for PI: ${paymentIntentId}`);
}

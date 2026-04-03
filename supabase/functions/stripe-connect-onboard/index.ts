// ================================================================
// STRIPE CONNECT ONBOARDING
// ================================================================
// Creates a Stripe Express account for a firm and returns the
// hosted onboarding URL. Only callable by firm owners and admins.
//
// POST /functions/v1/stripe-connect-onboard
// Auth: Supabase JWT (owner or admin role required)
// Body: { return_url?: string }
// Returns: { url: string, stripe_account_id: string }
// ================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { stripe } from '../_shared/stripe.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Authenticate the caller via Supabase JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return errorResponse(401, 'Missing authorization header');
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return errorResponse(401, 'Invalid or expired token');
    }

    // 2. Verify the caller is an owner or admin
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .select('firm_id, role, email, first_name')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return errorResponse(403, 'User profile not found');
    }

    if (!['owner', 'admin'].includes(profile.role)) {
      return errorResponse(403, 'Only firm owners and admins can connect Stripe');
    }

    const firmId = profile.firm_id;

    // 3. Check if the firm already has a Stripe account
    const { data: existing } = await supabaseAdmin
      .from('stripe_accounts')
      .select('stripe_account_id, onboarding_status')
      .eq('firm_id', firmId)
      .single();

    let stripeAccountId: string;

    if (existing?.stripe_account_id) {
      // Account exists — generate a fresh onboarding link (for incomplete onboarding)
      stripeAccountId = existing.stripe_account_id;
    } else {
      // 4. Create a new Stripe Express account
      const { data: firm } = await supabaseAdmin
        .from('firms')
        .select('name, email')
        .eq('id', firmId)
        .single();

      const account = await stripe.accounts.create({
        type: 'express',
        country: 'US',
        email: profile.email || firm?.email || user.email,
        business_type: 'company',
        company: {
          name: firm?.name || 'Surveying Firm',
        },
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: {
          surveyos_firm_id: firmId,
          created_by: user.id,
        },
      });

      stripeAccountId = account.id;

      // 5. Store the account reference in our database
      await supabaseAdmin.from('stripe_accounts').insert({
        firm_id: firmId,
        stripe_account_id: stripeAccountId,
        account_type: 'express',
        onboarding_status: 'pending',
        charges_enabled: false,
        payouts_enabled: false,
        default_take_rate: 0.0275, // 2.75% default
      });
    }

    // 6. Generate the Account Link (hosted onboarding page)
    const body = await req.json().catch(() => ({}));
    const origin = body.return_url || Deno.env.get('SITE_URL') || 'https://surveyos.app';

    const accountLink = await stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url: `${origin}/settings?stripe=refresh`,
      return_url: `${origin}/settings?stripe=complete`,
      type: 'account_onboarding',
    });

    return new Response(
      JSON.stringify({
        url: accountLink.url,
        stripe_account_id: stripeAccountId,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );
  } catch (err) {
    console.error('stripe-connect-onboard error:', err);
    return errorResponse(500, err.message || 'Internal server error');
  }
});

function errorResponse(status: number, message: string) {
  return new Response(
    JSON.stringify({ error: message }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status },
  );
}

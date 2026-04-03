// ================================================================
// CLIENT NOTIFICATION PIPELINE
// ================================================================
// Sends email (via Resend) when a project reaches key milestones.
// Called by the frontend when PM generates a deliverable package,
// or by a DB trigger on project status changes.
//
// POST /functions/v1/notify-client
// Auth: Supabase JWT (owner, admin, pm) OR service role (for triggers)
// Body: {
//   project_id: string,
//   template: 'deliverable_ready' | 'signature_confirmed' | 'payment_received',
//   client_email: string,
//   client_name?: string,
//   share_token?: string,
//   extra?: object
// }
// ================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') || 'notifications@surveyos.app';
const SITE_URL = Deno.env.get('SITE_URL') || 'https://surveyos.app';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { project_id, template, client_email, client_name, share_token, extra } = body;

    if (!project_id || !template || !client_email) {
      return errorResponse(400, 'Missing required fields: project_id, template, client_email');
    }

    // Fetch project details
    const { data: project } = await supabaseAdmin
      .from('projects')
      .select('project_name, firm_id')
      .eq('id', project_id)
      .single();

    if (!project) return errorResponse(404, 'Project not found');

    // Fetch firm name
    const { data: firm } = await supabaseAdmin
      .from('firms')
      .select('name')
      .eq('id', project.firm_id)
      .single();

    const firmName = firm?.name || 'Your Surveyor';
    const projectName = project.project_name;
    const portalUrl = share_token ? `${SITE_URL}/?share=${share_token}` : `${SITE_URL}`;

    // Build email content based on template
    const email = buildEmail(template, {
      clientName: client_name || 'Valued Client',
      projectName,
      firmName,
      portalUrl,
      extra,
    });

    // Send via Resend (or log if no API key)
    let externalId = null;
    let status = 'sent';

    if (RESEND_API_KEY) {
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: `SurveyOS <${FROM_EMAIL}>`,
            to: [client_email],
            subject: email.subject,
            html: email.html,
          }),
        });

        const result = await res.json();
        externalId = result.id || null;
        status = res.ok ? 'sent' : 'failed';

        if (!res.ok) {
          console.error('Resend error:', result);
        }
      } catch (err) {
        console.error('Email send failed:', err.message);
        status = 'failed';
      }
    } else {
      console.log('[notify-client] No RESEND_API_KEY — logging email:');
      console.log(`  To: ${client_email}`);
      console.log(`  Subject: ${email.subject}`);
      console.log(`  Template: ${template}`);
    }

    // Log the notification
    const { data: shareTokenRecord } = share_token
      ? await supabaseAdmin.from('share_tokens').select('id').eq('token', share_token).single()
      : { data: null };

    await supabaseAdmin.from('notification_log').insert({
      project_id,
      share_token_id: shareTokenRecord?.id || null,
      channel: 'email',
      recipient: client_email,
      template,
      payload: { subject: email.subject, portalUrl },
      status,
      external_id: externalId,
    });

    return new Response(
      JSON.stringify({ success: true, status, external_id: externalId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
    );
  } catch (err) {
    console.error('notify-client error:', err);
    return errorResponse(500, err.message || 'Internal error');
  }
});

// ================================================================
// EMAIL TEMPLATES
// ================================================================

interface EmailData {
  clientName: string;
  projectName: string;
  firmName: string;
  portalUrl: string;
  extra?: Record<string, any>;
}

function buildEmail(template: string, data: EmailData) {
  switch (template) {
    case 'deliverable_ready':
      return {
        subject: `Your survey for ${data.projectName} is complete`,
        html: wrapHtml(`
          <h2 style="margin:0 0 16px;color:#1d1d1f">Your Survey is Complete</h2>
          <p style="color:#424245;line-height:1.6;margin:0 0 16px">
            Hi ${data.clientName},
          </p>
          <p style="color:#424245;line-height:1.6;margin:0 0 24px">
            <strong>${data.firmName}</strong> has completed fieldwork for
            <strong>${data.projectName}</strong>. Your survey deliverables are ready for review.
          </p>
          <p style="color:#424245;line-height:1.6;margin:0 0 24px">
            Please review the field data, GPS-verified photos, and QA/QC report. When you're satisfied,
            sign off digitally to receive your Certificate of Completion.
          </p>
          ${ctaButton(data.portalUrl, 'Review & Sign Off')}
        `),
      };

    case 'signature_confirmed':
      return {
        subject: `Signature confirmed for ${data.projectName}`,
        html: wrapHtml(`
          <h2 style="margin:0 0 16px;color:#1d1d1f">Signature Confirmed</h2>
          <p style="color:#424245;line-height:1.6;margin:0 0 16px">
            Hi ${data.clientName},
          </p>
          <p style="color:#424245;line-height:1.6;margin:0 0 24px">
            Thank you for signing off on <strong>${data.projectName}</strong>.
            ${data.extra?.certificateNumber ? `Your Certificate of Completion (<strong>#${data.extra.certificateNumber}</strong>) is now available for download.` : ''}
          </p>
          ${ctaButton(data.portalUrl, 'View Certificate')}
        `),
      };

    case 'payment_received':
      return {
        subject: `Payment received for ${data.projectName}`,
        html: wrapHtml(`
          <h2 style="margin:0 0 16px;color:#1d1d1f">Payment Received</h2>
          <p style="color:#424245;line-height:1.6;margin:0 0 16px">
            Hi ${data.clientName},
          </p>
          <p style="color:#424245;line-height:1.6;margin:0 0 24px">
            Your payment${data.extra?.amount ? ` of <strong>$${data.extra.amount}</strong>` : ''} for
            <strong>${data.projectName}</strong> has been received. Thank you for choosing
            <strong>${data.firmName}</strong>.
          </p>
          ${ctaButton(data.portalUrl, 'View Receipt')}
        `),
      };

    default:
      return {
        subject: `Update on ${data.projectName}`,
        html: wrapHtml(`
          <p style="color:#424245;line-height:1.6">
            Hi ${data.clientName}, there's an update on <strong>${data.projectName}</strong>.
          </p>
          ${ctaButton(data.portalUrl, 'View Project')}
        `),
      };
  }
}

function wrapHtml(body: string) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e5e7">
    <div style="background:#0D4F4F;padding:24px 32px">
      <span style="color:#D4912A;font-weight:800;font-size:1.1em;letter-spacing:1px">SURVEYOS</span>
    </div>
    <div style="padding:32px">${body}</div>
    <div style="padding:16px 32px;background:#fafafa;border-top:1px solid #f0f0f0;text-align:center">
      <p style="margin:0;font-size:0.75em;color:#999">Powered by SurveyOS &mdash; The Operating System for Land Surveying</p>
    </div>
  </div>
</body>
</html>`;
}

function ctaButton(url: string, label: string) {
  return `<div style="text-align:center;margin:32px 0">
    <a href="${url}" style="display:inline-block;padding:14px 36px;background:#0D4F4F;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:0.95em">${label}</a>
  </div>`;
}

function errorResponse(status: number, message: string) {
  return new Response(
    JSON.stringify({ error: message }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status },
  );
}

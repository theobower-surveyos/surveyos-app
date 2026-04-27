// ================================================================
// Stage 11.1: generate-qc-narrative Edge Function
// ================================================================
// Generates a Claude-written natural-language summary of a QC run.
// Invoked from the frontend (sosProcessRun.js) after processRun
// successfully writes a fresh stakeout_qc_runs + stakeout_qc_points
// batch, in fire-and-forget mode.
//
// POST /functions/v1/generate-qc-narrative
// Auth: Supabase JWT (the caller's — chief or office role).
// Body: { run_id: string, narrative_type?: 'run_summary' | 'no_match_summary' }
// Returns: { body, narrative_id, narrative_type } on success,
//          { error, detail? } on failure.
//
// Anthropic API key lives in the ANTHROPIC_API_KEY Supabase secret.
// Never logged. Errors persisted to stakeout_qc_narratives.error so
// the PM-facing UI can surface "summary unavailable" instead of an
// indefinite spinner.
// ================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const PROMPT_VERSION = 'v1';
const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 400;

interface RequestBody {
    run_id: string;
    narrative_type?: 'run_summary' | 'no_match_summary';
}

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
        if (!apiKey) {
            return jsonResponse({ error: 'ANTHROPIC_API_KEY not configured' }, 500);
        }

        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            return jsonResponse({ error: 'Missing authorization header' }, 401);
        }

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: authHeader } } },
        );

        const payload = (await req.json()) as RequestBody;
        const run_id = payload?.run_id;
        const narrative_type_raw = payload?.narrative_type ?? 'run_summary';
        if (!run_id) {
            return jsonResponse({ error: 'run_id required' }, 400);
        }

        const context = await fetchRunContext(supabase, run_id);
        if (!context) {
            return jsonResponse({ error: 'Run not found or access denied' }, 404);
        }

        const effectiveType = decideNarrativeType(context, narrative_type_raw);
        const { systemPrompt, userPrompt } = buildPrompt(context, effectiveType);

        const anthropicResponse = await callAnthropic(apiKey, systemPrompt, userPrompt);

        if (!anthropicResponse.ok) {
            const errorText = await anthropicResponse.text();
            await upsertNarrative(supabase, {
                run_id,
                narrative_type: effectiveType,
                body: null,
                error: `Anthropic API error: ${anthropicResponse.status} ${errorText.slice(0, 500)}`,
            });
            return jsonResponse(
                { error: 'Anthropic API error', detail: errorText.slice(0, 500) },
                502,
            );
        }

        const anthropicData = await anthropicResponse.json();
        const narrativeBody = extractBodyFromResponse(anthropicData);

        if (!narrativeBody) {
            await upsertNarrative(supabase, {
                run_id,
                narrative_type: effectiveType,
                body: null,
                error: 'Empty response from Anthropic API',
            });
            return jsonResponse({ error: 'Empty response from Anthropic' }, 502);
        }

        const narrativeRow = await upsertNarrative(supabase, {
            run_id,
            narrative_type: effectiveType,
            body: narrativeBody,
            error: null,
        });

        return jsonResponse({
            body: narrativeBody,
            narrative_id: narrativeRow?.id ?? null,
            narrative_type: effectiveType,
        });
    } catch (err) {
        console.error('generate-qc-narrative error:', err);
        const message = err instanceof Error ? err.message : 'Unknown error';
        return jsonResponse({ error: message }, 500);
    }
});

// ── Helpers ───────────────────────────────────────────────────────

function jsonResponse(payload: unknown, status = 200): Response {
    return new Response(JSON.stringify(payload), {
        status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
}

interface RunContext {
    run: any;
    points: any[];
    assignment: any;
    project: any;
    chief: any;
}

async function fetchRunContext(supabase: any, run_id: string): Promise<RunContext | null> {
    const { data: run, error: runErr } = await supabase
        .from('stakeout_qc_runs')
        .select('*')
        .eq('id', run_id)
        .maybeSingle();
    if (runErr || !run) return null;

    const { data: points } = await supabase
        .from('stakeout_qc_points')
        .select('observed_point_id, raw_code, shot_type, h_status, v_status, delta_h, delta_z, effective_tolerance_h, effective_tolerance_v, field_fit_reason, field_fit_note, declared_offset_distance, actual_offset_distance')
        .eq('run_id', run_id);

    const { data: assignment } = await supabase
        .from('stakeout_assignments')
        .select('*')
        .eq('id', run.assignment_id)
        .maybeSingle();

    let project = null;
    if (assignment?.project_id) {
        const { data: projData } = await supabase
            .from('projects')
            .select('id, project_name, location')
            .eq('id', assignment.project_id)
            .maybeSingle();
        project = projData ?? null;
    }

    let chief = null;
    if (run.party_chief_id) {
        const { data: chiefData } = await supabase
            .from('user_profiles')
            .select('first_name, last_name, role')
            .eq('id', run.party_chief_id)
            .maybeSingle();
        chief = chiefData ?? null;
    }

    return { run, points: points ?? [], assignment, project, chief };
}

function decideNarrativeType(
    context: RunContext,
    requested: string,
): 'run_summary' | 'no_match_summary' {
    const stakes = (context.points ?? []).filter(
        (p: any) => p.shot_type === 'point_stake' || p.shot_type === 'line_stake',
    );
    if (stakes.length === 0) return 'no_match_summary';
    return (requested === 'no_match_summary' ? 'no_match_summary' : 'run_summary');
}

function chiefName(chief: any): string {
    if (!chief) return 'crew chief';
    const parts = [chief.first_name, chief.last_name].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : 'crew chief';
}

function buildPrompt(
    context: RunContext,
    narrativeType: 'run_summary' | 'no_match_summary',
): { systemPrompt: string; userPrompt: string } {
    const { run, points, assignment, project } = context;
    const projectName = project?.project_name ?? 'unknown project';
    const projectLocation = project?.location ?? '';
    const assignmentName = assignment?.title ?? 'assignment';
    const chief = chiefName(context.chief);

    const stakes = points.filter(
        (p: any) => p.shot_type === 'point_stake' || p.shot_type === 'line_stake',
    );
    const inTol = stakes.filter((p: any) => p.h_status === 'in_tol').length;
    const outTol = stakes.filter((p: any) => p.h_status === 'out_of_tol').length;
    const fieldFit = stakes.filter((p: any) => p.h_status === 'field_fit').length;
    const checkPass = points.filter(
        (p: any) => p.shot_type === 'check_shot' && p.h_status === 'check_pass',
    ).length;
    const checkFail = points.filter(
        (p: any) => p.shot_type === 'check_shot' && p.h_status === 'check_fail',
    ).length;
    const unmatchedCheck = points.filter(
        (p: any) => p.shot_type === 'control_check' && p.h_status === 'unmatched_check',
    ).length;
    const unmatched = points.filter((p: any) => p.shot_type === 'unmatched_bonus').length;
    const parseErrors = points.filter((p: any) => p.shot_type === 'parse_error').length;

    const concernRows = stakes
        .filter((p: any) => p.h_status === 'out_of_tol' || p.h_status === 'field_fit')
        .slice(0, 8)
        .map((p: any) => ({
            design_ref: p.observed_point_id,
            raw_code: p.raw_code,
            delta_h: p.delta_h,
            tolerance_h: p.effective_tolerance_h,
            status: p.h_status,
            field_fit_reason: p.field_fit_reason,
            field_fit_note: p.field_fit_note,
        }));

    const systemPrompt = `You are an expert land surveyor writing a brief, factual quality-control summary of a stakeout run. Your audience is a project manager reviewing the chief's work.

Voice and constraints:
- Terse, professional, factual. No marketing language. No flourishes.
- 80-150 words. One paragraph. 4-6 sentences.
- Use ONLY the facts provided in the run data. Never invent point IDs, deltas, codes, or reasons.
- If a stake is field-fit, state the reason if it was provided. Don't speculate on causes that aren't in the data.
- Use surveying vocabulary correctly: "stakes in tolerance," "horizontal delta," "out of tolerance," "field-fit," "check shot."
- Do not include greetings, signoffs, or meta-commentary about the report itself.
- Lead with the topline result (X of Y in tolerance). Then call out specific concerns by point ID.`;

    if (narrativeType === 'no_match_summary') {
        const userPrompt = `Run data — no stakes matched against design points. Summarize what happened.

Project: ${projectName}${projectLocation ? ' at ' + projectLocation : ''}
Assignment: ${assignmentName}
Chief: ${chief}
Total observations uploaded: ${points.length}
Parse errors: ${parseErrors}
Unmatched (no design point reference): ${unmatched}
Unmatched control checks: ${unmatchedCheck}

Write a 60-100 word summary explaining that QC results could not be computed for this run, the likely cause based on the breakdown, and what the chief or PM should investigate. Do not invent specific point IDs or reasons not in the data.`;
        return { systemPrompt, userPrompt };
    }

    const userPrompt = `Run data:

Project: ${projectName}${projectLocation ? ' at ' + projectLocation : ''}
Assignment: ${assignmentName}
Chief: ${chief}
Submitted: ${run.submitted_at ?? 'pending'}

Stake QC totals:
- In tolerance: ${inTol}
- Out of tolerance: ${outTol}
- Field-fit (chief-flagged deviations): ${fieldFit}
- Total stakes evaluated: ${stakes.length}

Check shots: ${checkPass} passed, ${checkFail} failed
Unmatched control checks: ${unmatchedCheck}
Bonus shots (no design ref): ${unmatched}
Parse errors: ${parseErrors}

Concerns (out-of-tolerance and field-fit stakes):
${concernRows.length === 0 ? 'None — all stakes in tolerance.' : JSON.stringify(concernRows, null, 2)}

Write the summary now.`;

    return { systemPrompt, userPrompt };
}

async function callAnthropic(
    apiKey: string,
    systemPrompt: string,
    userPrompt: string,
): Promise<Response> {
    return await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
        },
        body: JSON.stringify({
            model: MODEL,
            max_tokens: MAX_TOKENS,
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }],
        }),
    });
}

function extractBodyFromResponse(data: any): string | null {
    if (!data?.content || !Array.isArray(data.content)) return null;
    const textBlocks = data.content
        .filter((c: any) => c?.type === 'text')
        .map((c: any) => c.text)
        .join('\n')
        .trim();
    return textBlocks || null;
}

interface UpsertPayload {
    run_id: string;
    narrative_type: string;
    body: string | null;
    error: string | null;
}

async function upsertNarrative(supabase: any, payload: UpsertPayload) {
    const { data, error } = await supabase
        .from('stakeout_qc_narratives')
        .upsert(
            {
                run_id: payload.run_id,
                narrative_type: payload.narrative_type,
                body: payload.body,
                error: payload.error,
                model: MODEL,
                prompt_version: PROMPT_VERSION,
                generated_at: new Date().toISOString(),
            },
            { onConflict: 'run_id,narrative_type' },
        )
        .select('id')
        .maybeSingle();

    if (error) {
        console.error('upsertNarrative error:', error);
        return null;
    }
    return data;
}

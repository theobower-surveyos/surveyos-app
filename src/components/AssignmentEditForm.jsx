import React, { useMemo, useState } from 'react';
import { Save, X, ChevronDown, ChevronUp, Phone } from 'lucide-react';

// ─── AssignmentEditForm ───────────────────────────────────────────────
// Inline form rendered in place of the read-only metadata card. Same
// field layout as the AssignmentBuilder form, plus a collapsible client-
// contact section. Validation runs on Save before any DB write — invalid
// rows show inline errors and the form stays in edit mode.

function isBlank(s) {
    return !s || String(s).trim() === '';
}

function normalizeStr(s) {
    if (s == null) return '';
    return String(s);
}

function diffNumeric(input, original) {
    if (input === '') return null;
    const n = Number(input);
    return Number.isFinite(n) ? n : null;
}

export default function AssignmentEditForm({
    supabase,
    assignment,
    partyChiefs,
    onSaved,
    onCancelled,
    onToast,
    readOnlyPartyChief = false,
}) {
    const [title, setTitle] = useState(assignment.title || '');
    const [assignmentDate, setAssignmentDate] = useState(assignment.assignment_date || '');
    const [partyChiefId, setPartyChiefId] = useState(assignment.party_chief_id || '');
    const [expectedHours, setExpectedHours] = useState(
        assignment.expected_hours != null ? String(assignment.expected_hours) : '',
    );
    const [toleranceH, setToleranceH] = useState(
        assignment.default_tolerance_h != null ? String(assignment.default_tolerance_h) : '0.060',
    );
    const [toleranceV, setToleranceV] = useState(
        assignment.default_tolerance_v != null ? String(assignment.default_tolerance_v) : '0.030',
    );
    const [notes, setNotes] = useState(assignment.notes || '');

    const [contactOpen, setContactOpen] = useState(
        Boolean(
            assignment.client_contact_name ||
                assignment.client_contact_phone ||
                assignment.client_contact_role ||
                assignment.client_contact_notes,
        ),
    );
    const [contactName, setContactName] = useState(assignment.client_contact_name || '');
    const [contactPhone, setContactPhone] = useState(assignment.client_contact_phone || '');
    const [contactRole, setContactRole] = useState(assignment.client_contact_role || '');
    const [contactNotes, setContactNotes] = useState(assignment.client_contact_notes || '');

    const [errors, setErrors] = useState({});
    const [saving, setSaving] = useState(false);

    const validation = useMemo(() => {
        const e = {};
        if (isBlank(title)) e.title = 'Title is required';
        const tH = Number(toleranceH);
        if (!Number.isFinite(tH) || tH <= 0 || tH >= 1)
            e.toleranceH = 'Must be a positive number under 1';
        const tV = Number(toleranceV);
        if (!Number.isFinite(tV) || tV <= 0 || tV >= 1)
            e.toleranceV = 'Must be a positive number under 1';
        if (expectedHours !== '') {
            const eh = Number(expectedHours);
            if (!Number.isFinite(eh) || eh < 0) e.expectedHours = 'Must be a non-negative number';
        }
        return e;
    }, [title, toleranceH, toleranceV, expectedHours]);

    const isValid = Object.keys(validation).length === 0;

    async function handleSave() {
        if (saving) return;
        if (!isValid) {
            setErrors(validation);
            onToast('error', 'Fix the highlighted fields before saving.');
            return;
        }

        setSaving(true);
        const updates = {
            title: title.trim(),
            assignment_date: assignmentDate || null,
            party_chief_id: partyChiefId || null,
            expected_hours: expectedHours === '' ? null : Number(expectedHours),
            default_tolerance_h: Number(toleranceH),
            default_tolerance_v: Number(toleranceV),
            notes: notes.trim() || null,
            client_contact_name: contactName.trim() || null,
            client_contact_phone: contactPhone.trim() || null,
            client_contact_role: contactRole.trim() || null,
            client_contact_notes: contactNotes.trim() || null,
        };

        // If chief is locked, don't transmit it (defensive — should match DB).
        if (readOnlyPartyChief) delete updates.party_chief_id;

        try {
            const { data, error } = await supabase
                .from('stakeout_assignments')
                .update(updates)
                .eq('id', assignment.id)
                .select('*')
                .single();
            if (error) throw error;
            onToast('success', 'Assignment updated.');
            onSaved(data);
        } catch (err) {
            console.error('[AssignmentEditForm] save failed:', err);
            onToast('error', `Could not save${err?.code ? ` (code ${err.code})` : ''}. Try again.`);
        } finally {
            setSaving(false);
        }
    }

    const fieldErr = errors.__shown ? errors : validation;

    return (
        <form onSubmit={(e) => e.preventDefault()} style={cardStyle}>
            <style>{`
                .aef-input, .aef-select, .aef-textarea {
                    background-color: var(--bg-dark);
                    color: var(--text-main);
                    border: 1px solid var(--border-subtle);
                    border-radius: 6px;
                    padding: 8px 10px;
                    font-size: 14px;
                    font-family: inherit;
                    width: 100%;
                    box-sizing: border-box;
                    transition: border-color 0.15s ease;
                }
                .aef-input:focus, .aef-select:focus, .aef-textarea:focus {
                    outline: none;
                    border-color: var(--brand-teal-light);
                }
                .aef-input.invalid, .aef-textarea.invalid {
                    border-color: var(--error);
                }
                .aef-textarea { resize: vertical; min-height: 64px; }
                .aef-label {
                    display: block;
                    color: var(--text-muted);
                    font-size: 12px;
                    letter-spacing: 0.5px;
                    text-transform: uppercase;
                    font-weight: 600;
                    margin-bottom: 6px;
                }
                .aef-err {
                    color: var(--error);
                    font-size: 11.5px;
                    margin-top: 4px;
                }
                .aef-divider {
                    height: 1px;
                    background: var(--border-subtle);
                    margin: 6px 0;
                }
                .aef-row {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 14px;
                }
                @media (max-width: 600px) {
                    .aef-row { grid-template-columns: 1fr; }
                }
            `}</style>

            <h3 style={headingStyle}>Edit assignment</h3>

            <FieldGroup>
                <Field label="Title" htmlFor="aef-title" error={fieldErr.title}>
                    <input
                        id="aef-title"
                        type="text"
                        className={`aef-input ${fieldErr.title ? 'invalid' : ''}`}
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        required
                    />
                </Field>
                <Field label="Assignment date" htmlFor="aef-date">
                    <input
                        id="aef-date"
                        type="date"
                        className="aef-input"
                        value={assignmentDate}
                        onChange={(e) => setAssignmentDate(e.target.value)}
                    />
                </Field>
            </FieldGroup>

            <div className="aef-divider" />

            <FieldGroup>
                <Field
                    label={readOnlyPartyChief ? 'Party chief (locked — already sent)' : 'Party chief'}
                    htmlFor="aef-chief"
                >
                    <select
                        id="aef-chief"
                        className="aef-select"
                        value={partyChiefId}
                        onChange={(e) => setPartyChiefId(e.target.value)}
                        disabled={readOnlyPartyChief}
                    >
                        <option value="">Unassigned</option>
                        {partyChiefs.map((c) => (
                            <option key={c.id} value={c.id}>
                                {`${c.first_name || ''} ${c.last_name || ''}`.trim() ||
                                    'Unnamed chief'}
                            </option>
                        ))}
                    </select>
                </Field>
                <Field label="Expected hours" htmlFor="aef-hours" error={fieldErr.expectedHours}>
                    <input
                        id="aef-hours"
                        type="number"
                        step="0.5"
                        min="0"
                        className={`aef-input ${fieldErr.expectedHours ? 'invalid' : ''}`}
                        value={expectedHours}
                        onChange={(e) => setExpectedHours(e.target.value)}
                        placeholder="4.5"
                    />
                </Field>
            </FieldGroup>

            <div className="aef-divider" />

            <FieldGroup>
                <Field label="Default tolerance H (ft)" htmlFor="aef-tol-h" error={fieldErr.toleranceH}>
                    <input
                        id="aef-tol-h"
                        type="number"
                        step="0.001"
                        min="0"
                        className={`aef-input coordinate-data ${fieldErr.toleranceH ? 'invalid' : ''}`}
                        value={toleranceH}
                        onChange={(e) => setToleranceH(e.target.value)}
                    />
                </Field>
                <Field label="Default tolerance V (ft)" htmlFor="aef-tol-v" error={fieldErr.toleranceV}>
                    <input
                        id="aef-tol-v"
                        type="number"
                        step="0.001"
                        min="0"
                        className={`aef-input coordinate-data ${fieldErr.toleranceV ? 'invalid' : ''}`}
                        value={toleranceV}
                        onChange={(e) => setToleranceV(e.target.value)}
                    />
                </Field>
            </FieldGroup>

            <div className="aef-divider" />

            <Field label="Notes" htmlFor="aef-notes">
                <textarea
                    id="aef-notes"
                    rows={3}
                    className="aef-textarea"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                />
            </Field>

            {/* Client contact (collapsible) */}
            <button
                type="button"
                onClick={() => setContactOpen((v) => !v)}
                style={{
                    background: 'transparent',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '8px',
                    color: 'var(--text-main)',
                    padding: '10px 14px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontFamily: 'inherit',
                    fontSize: '13px',
                    fontWeight: 600,
                    marginTop: '6px',
                }}
                aria-expanded={contactOpen}
            >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                    <Phone size={14} color="var(--brand-amber)" /> Client contact
                </span>
                {contactOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {contactOpen && (
                <div
                    style={{
                        marginTop: '12px',
                        padding: '12px 14px',
                        backgroundColor: 'var(--bg-dark)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '8px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                    }}
                >
                    <FieldGroup>
                        <Field label="Contact name" htmlFor="aef-contact-name">
                            <input
                                id="aef-contact-name"
                                type="text"
                                className="aef-input"
                                value={contactName}
                                onChange={(e) => setContactName(e.target.value)}
                            />
                        </Field>
                        <Field label="Contact phone" htmlFor="aef-contact-phone">
                            <input
                                id="aef-contact-phone"
                                type="tel"
                                className="aef-input"
                                value={contactPhone}
                                onChange={(e) => setContactPhone(e.target.value)}
                                placeholder="(555) 555-5555"
                            />
                        </Field>
                    </FieldGroup>
                    <Field label="Contact role" htmlFor="aef-contact-role">
                        <input
                            id="aef-contact-role"
                            type="text"
                            className="aef-input"
                            value={contactRole}
                            onChange={(e) => setContactRole(e.target.value)}
                            placeholder="Site superintendent, foreman..."
                        />
                    </Field>
                    <Field label="Contact notes" htmlFor="aef-contact-notes">
                        <textarea
                            id="aef-contact-notes"
                            rows={2}
                            className="aef-textarea"
                            value={contactNotes}
                            onChange={(e) => setContactNotes(e.target.value)}
                            placeholder="Site access, gate codes, hours..."
                        />
                    </Field>
                </div>
            )}

            <div
                style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: '10px',
                    marginTop: '18px',
                    flexWrap: 'wrap',
                }}
            >
                <button
                    type="button"
                    onClick={onCancelled}
                    disabled={saving}
                    style={secondaryBtn(saving)}
                >
                    <X size={13} /> Cancel
                </button>
                <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    style={primaryBtn(saving)}
                >
                    <Save size={13} /> {saving ? 'Saving…' : 'Save changes'}
                </button>
            </div>
        </form>
    );
}

function Field({ label, htmlFor, children, error }) {
    return (
        <div style={{ flex: 1, minWidth: 0 }}>
            <label className="aef-label" htmlFor={htmlFor}>
                {label}
            </label>
            {children}
            {error && <div className="aef-err">{error}</div>}
        </div>
    );
}

function FieldGroup({ children }) {
    return <div className="aef-row">{children}</div>;
}

const cardStyle = {
    backgroundColor: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '12px',
    padding: '20px 22px',
    marginBottom: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
};

const headingStyle = {
    margin: 0,
    fontSize: '15px',
    fontWeight: 600,
    color: 'var(--text-main)',
    letterSpacing: '0.2px',
};

function primaryBtn(disabled) {
    return {
        backgroundColor: 'var(--brand-teal)',
        color: '#fff',
        border: '1px solid var(--brand-teal)',
        padding: '9px 16px',
        borderRadius: '8px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontWeight: 600,
        fontSize: '13px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        fontFamily: 'inherit',
    };
}

function secondaryBtn(disabled) {
    return {
        backgroundColor: 'transparent',
        color: 'var(--text-main)',
        border: '1px solid var(--border-subtle)',
        padding: '9px 16px',
        borderRadius: '8px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontWeight: 500,
        fontSize: '13px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        fontFamily: 'inherit',
    };
}

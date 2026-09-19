import React, { useState, useEffect } from 'react';

export default function FeedbackModal({ isOpen, onClose }) {
  const [category, setCategory] = useState('misclassification');
  const [h3Location, setH3Location] = useState('');
  const [description, setDescription] = useState('');
  const [email, setEmail] = useState('');
  const [urgency, setUrgency] = useState('routine');
  const [submitting, setSubmitting] = useState(false);
  const [submittedTicket, setSubmittedTicket] = useState(null);

  useEffect(() => {
    if (isOpen) {
      const handleKeyDown = (e) => {
        if (e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!description.trim()) return;

    setSubmitting(true);
    setTimeout(() => {
      const randomTicketId = `TRN-FB-${Math.floor(10000 + Math.random() * 90000)}`;
      setSubmittedTicket({
        id: randomTicketId,
        category,
        location: h3Location || 'Unspecified location',
        summary: description,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });
      setSubmitting(false);
    }, 600);
  };

  const handleReset = () => {
    setSubmittedTicket(null);
    setDescription('');
    setH3Location('');
    setEmail('');
    setCategory('misclassification');
    setUrgency('routine');
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        animation: 'fadeIn 0.18s ease-out'
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: 'var(--panel-surface)',
          color: 'var(--text-primary)',
          borderRadius: '14px',
          maxWidth: '640px',
          width: '100%',
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 65px rgba(0, 0, 0, 0.5), 0 0 0 1px var(--hairline-border)',
          border: '1px solid var(--hairline-border)',
          overflow: 'hidden'
        }}
      >
        {/* Modal Header */}
        <div style={{ padding: '1.25rem 1.75rem', borderBottom: '1px solid var(--hairline-border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(61, 157, 232, 0.15)',
                  border: '1px solid rgba(61, 157, 232, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3D9DE8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <div>
                <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.35rem', fontWeight: 800, margin: 0 }}>
                  Spatial Intelligence Feedback
                </h2>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Report thermal misclassifications, suggest unregistered facilities, or submit platform improvements
                </div>
              </div>
            </div>

            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '1.2rem',
                padding: '4px'
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem 1.75rem' }}>
          {submittedTicket ? (
            /* Success confirmation card */
            <div style={{ textAlign: 'center', padding: '1.5rem 0.5rem' }}>
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(46, 204, 113, 0.15)',
                  border: '2px solid #2ECC71',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 1.25rem auto',
                  boxShadow: '0 0 20px rgba(46, 204, 113, 0.3)'
                }}
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2ECC71" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>

              <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.4rem', fontWeight: 800, margin: '0 0 0.5rem 0' }}>
                Feedback Dispatched
              </h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', maxWidth: '420px', margin: '0 auto 1.5rem auto', lineHeight: 1.5 }}>
                Your report has been logged in TRINETRA's spatial audit database. Our spatial AI team verifies user ground-truth records against high-resolution Sentinel-2 optical imagery.
              </p>

              <div
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.18)',
                  border: '1px solid var(--hairline-border)',
                  borderRadius: '10px',
                  padding: '1rem 1.25rem',
                  maxWidth: '440px',
                  margin: '0 auto 1.5rem auto',
                  textAlign: 'left',
                  fontSize: '0.85rem'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Ticket Reference:</span>
                  <code style={{ fontFamily: 'monospace', color: 'var(--accent-ember)', fontWeight: 700 }}>
                    {submittedTicket.id}
                  </code>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Category:</span>
                  <strong style={{ color: 'var(--text-primary)', textTransform: 'capitalize' }}>
                    {submittedTicket.category.replace('_', ' ')}
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Logged At:</span>
                  <span style={{ color: 'var(--text-primary)' }}>Today, {submittedTicket.timestamp}</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                <button
                  onClick={handleReset}
                  style={{
                    padding: '0.6rem 1.25rem',
                    borderRadius: '8px',
                    backgroundColor: 'transparent',
                    border: '1px solid var(--hairline-border)',
                    color: 'var(--text-primary)',
                    fontFamily: 'var(--font-heading)',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Submit Another Report
                </button>
                <button
                  onClick={onClose}
                  style={{
                    padding: '0.6rem 1.5rem',
                    borderRadius: '8px',
                    backgroundColor: 'var(--accent-ember)',
                    border: 'none',
                    color: '#FFFFFF',
                    fontFamily: 'var(--font-heading)',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(255, 107, 53, 0.35)'
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          ) : (
            /* Feedback Input Form */
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Category selector */}
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontFamily: 'var(--font-heading)', fontWeight: 700, marginBottom: '0.5rem' }}>
                  Report Classification / Purpose
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
                  {[
                    { id: 'misclassification', label: 'Thermal Misclassification' },
                    { id: 'industrial_flare', label: 'Unlisted Industrial Flare' },
                    { id: 'feature_request', label: 'Feature Suggestion' },
                    { id: 'bug_report', label: 'Platform / Interface Bug' }
                  ].map(cat => {
                    const active = category === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setCategory(cat.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          padding: '0.65rem 0.85rem',
                          borderRadius: '8px',
                          border: '1px solid',
                          borderColor: active ? 'var(--accent-ember)' : 'var(--hairline-border)',
                          backgroundColor: active ? 'rgba(255, 107, 53, 0.1)' : 'rgba(255, 255, 255, 0.02)',
                          color: active ? 'var(--accent-ember)' : 'var(--text-primary)',
                          cursor: 'pointer',
                          fontSize: '0.82rem',
                          fontFamily: 'var(--font-heading)',
                          fontWeight: active ? 700 : 500,
                          textAlign: 'left',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <span>{cat.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Location or H3 index */}
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontFamily: 'var(--font-heading)', fontWeight: 700, marginBottom: '0.4rem' }}>
                  H3 Cell Index or Facility Landmark (Optional)
                </label>
                <input
                  type="text"
                  value={h3Location}
                  onChange={(e) => setH3Location(e.target.value)}
                  placeholder="e.g. 88209a2011fffff or Jamnagar Coking Plant"
                  style={{
                    width: '100%',
                    padding: '0.7rem 0.9rem',
                    borderRadius: '8px',
                    border: '1px solid var(--hairline-border)',
                    backgroundColor: 'rgba(0, 0, 0, 0.15)',
                    color: 'var(--text-primary)',
                    fontSize: '0.9rem',
                    fontFamily: 'inherit',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* Observation textarea */}
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontFamily: 'var(--font-heading)', fontWeight: 700, marginBottom: '0.4rem' }}>
                  Observation / Discrepancy Details <span style={{ color: 'var(--accent-ember)' }}>*</span>
                </label>
                <textarea
                  required
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe what you observed (e.g. 'Cell 88209a was classified as agricultural burn, but contains an active petrochemical flare stack at coordinates 22.47...')"
                  style={{
                    width: '100%',
                    padding: '0.75rem 0.9rem',
                    borderRadius: '8px',
                    border: '1px solid var(--hairline-border)',
                    backgroundColor: 'rgba(0, 0, 0, 0.15)',
                    color: 'var(--text-primary)',
                    fontSize: '0.9rem',
                    fontFamily: 'inherit',
                    outline: 'none',
                    resize: 'vertical',
                    lineHeight: 1.45,
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* Contact Email and Urgency */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '0.85rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontFamily: 'var(--font-heading)', fontWeight: 700, marginBottom: '0.4rem' }}>
                    Contact Email (Optional)
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="user@organization.gov.in"
                    style={{
                      width: '100%',
                      padding: '0.7rem 0.9rem',
                      borderRadius: '8px',
                      border: '1px solid var(--hairline-border)',
                      backgroundColor: 'rgba(0, 0, 0, 0.15)',
                      color: 'var(--text-primary)',
                      fontSize: '0.88rem',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontFamily: 'var(--font-heading)', fontWeight: 700, marginBottom: '0.4rem' }}>
                    Urgency Level
                  </label>
                  <select
                    value={urgency}
                    onChange={(e) => setUrgency(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.7rem 0.9rem',
                      borderRadius: '8px',
                      border: '1px solid var(--hairline-border)',
                      backgroundColor: 'rgba(0, 0, 0, 0.15)',
                      color: 'var(--text-primary)',
                      fontSize: '0.88rem',
                      outline: 'none',
                      boxSizing: 'border-box',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="routine">Routine Review</option>
                    <option value="priority">High Priority</option>
                    <option value="critical">Critical Safety Hazard</option>
                  </select>
                </div>
              </div>

              {/* Submit Button */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    padding: '0.65rem 1.25rem',
                    borderRadius: '8px',
                    backgroundColor: 'transparent',
                    border: '1px solid var(--hairline-border)',
                    color: 'var(--text-muted)',
                    fontFamily: 'var(--font-heading)',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !description.trim()}
                  style={{
                    padding: '0.65rem 1.6rem',
                    borderRadius: '8px',
                    backgroundColor: 'var(--accent-ember)',
                    border: 'none',
                    color: '#FFFFFF',
                    fontFamily: 'var(--font-heading)',
                    fontWeight: 700,
                    cursor: submitting || !description.trim() ? 'not-allowed' : 'pointer',
                    opacity: submitting || !description.trim() ? 0.6 : 1,
                    boxShadow: '0 4px 14px rgba(255, 107, 53, 0.35)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}
                >
                  {submitting ? (
                    <>
                      <span>Transmitting...</span>
                    </>
                  ) : (
                    <>
                      <span>Submit Intelligence</span>
                      <span>→</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

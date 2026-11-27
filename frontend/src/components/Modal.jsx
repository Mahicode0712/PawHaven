import React from 'react';
import { X } from 'lucide-react';

export function Modal({ title, onClose, children, wide = false }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-panel"
        style={wide ? { maxWidth: '880px' } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header no-print">
          <h3 style={{ margin: 0, fontSize: '1.12rem' }}>{title}</h3>
          <button className="btn btn-sm" onClick={onClose} aria-label="Close modal">
            <X size={16} /> Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

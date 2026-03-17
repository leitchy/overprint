import { useEffect } from 'react';
import type React from 'react';

/**
 * Shared hook for modal close behaviour:
 * - Closes on Escape key.
 * - Returns a backdrop click handler that closes when the backdrop itself is clicked.
 *
 * @param onClose  Callback invoked when the modal should close.
 */
export function useModalClose(onClose: () => void): {
  handleBackdropClick: (e: React.MouseEvent<HTMLDivElement>) => void;
} {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return {
    handleBackdropClick: (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
  };
}
